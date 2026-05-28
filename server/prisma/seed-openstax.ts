import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";
import bcrypt from "bcrypt";
import * as dotenv from "dotenv";

// pdfjs-dist@3 (legacy build) requires canvas@2.11.2 which has no Node v24
// prebuilt binaries. Intercept require('canvas') at the Node module level and
// return @napi-rs/canvas instead — this catches both init-time AND lazy
// render-time requires inside pdfjs.
(globalThis as any).DOMMatrix ??= DOMMatrix;
(globalThis as any).Path2D ??= Path2D;
(globalThis as any).ImageData ??= ImageData;

const _require = createRequire(import.meta.url);
const NodeModule = _require("module") as any;
const _nativeCanvas = { createCanvas, DOMMatrix, Path2D, ImageData };
const _origLoad = NodeModule._load.bind(NodeModule);
NodeModule._load = (id: string, ...args: any[]) => {
  if (id === "canvas") return _nativeCanvas;
  return _origLoad(id, ...args);
};

const pdfjsLib = _require("pdfjs-dist/legacy/build/pdf.js") as any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED" as const,
  responseChecksumValidation: "WHEN_REQUIRED" as const,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenStaxBook {
  title: string;
  subject: string;
  edition: string;
  description: string;
  pageUrl: string;
  year: number;
  categories: string[];
}

// ─── Hardcoded Book Data ──────────────────────────────────────────────────────

const BOOKS: OpenStaxBook[] = [
  // MATHEMATICS
  {
    title: "Prealgebra 2e",
    subject: "Mathematics",
    edition: "2e",
    description:
      "Comprehensive coverage of arithmetic operations, fractions, decimals, ratios, percents, basic geometry, and an introduction to algebra. Designed for students who need foundational preparation before entering college-level mathematics courses.",
    pageUrl: "https://openstax.org/details/books/prealgebra-2e",
    year: 2022,
    categories: ["prealgebra", "mathematics"],
  },
  {
    title: "Elementary Algebra 2e",
    subject: "Mathematics",
    edition: "2e",
    description:
      "Fundamentals of algebra: real numbers, linear equations and inequalities, systems of equations, polynomials, factoring, rational expressions, radical expressions, and quadratic equations.",
    pageUrl: "https://openstax.org/details/books/elementary-algebra-2e",
    year: 2020,
    categories: ["algebra", "mathematics"],
  },
  {
    title: "Intermediate Algebra 2e",
    subject: "Mathematics",
    edition: "2e",
    description:
      "Intermediate algebraic concepts: polynomials, factoring, rational expressions, roots and radicals, quadratic equations, exponential and logarithmic functions, and conic sections.",
    pageUrl: "https://openstax.org/details/books/intermediate-algebra-2e",
    year: 2020,
    categories: ["algebra", "mathematics"],
  },
  {
    title: "College Algebra 2e",
    subject: "Mathematics",
    edition: "2e",
    description:
      "College-level algebra covering functions, polynomial and rational functions, exponential and logarithmic functions, systems of equations, sequences, and probability. Emphasizes mathematical modeling and real-world applications.",
    pageUrl: "https://openstax.org/details/books/college-algebra-2e",
    year: 2021,
    categories: ["algebra", "mathematics"],
  },
  {
    title: "Algebra and Trigonometry 2e",
    subject: "Mathematics",
    edition: "2e",
    description:
      "Combined algebra and trigonometry covering functions, polynomial functions, trigonometric functions, inverse trigonometric functions, trigonometric identities, and vectors with applications in science and engineering.",
    pageUrl: "https://openstax.org/details/books/algebra-and-trigonometry-2e",
    year: 2021,
    categories: ["algebra", "trigonometry", "mathematics"],
  },
  {
    title: "Precalculus 2e",
    subject: "Mathematics",
    edition: "2e",
    description:
      "Preparation for calculus: functions, polynomial and rational functions, exponential and logarithmic functions, trigonometric functions, analytic trigonometry, analytic geometry, sequences and series, and probability.",
    pageUrl: "https://openstax.org/details/books/precalculus-2e",
    year: 2021,
    categories: ["precalculus", "mathematics"],
  },
  {
    title: "Calculus Volume 1",
    subject: "Mathematics",
    edition: "1e",
    description:
      "Single-variable calculus: limits and continuity, derivatives, applications of differentiation, antiderivatives, and integrals with the Fundamental Theorem of Calculus. Applications to physics, economics, and engineering.",
    pageUrl: "https://openstax.org/details/books/calculus-volume-1",
    year: 2016,
    categories: ["calculus", "mathematics"],
  },
  {
    title: "Calculus Volume 2",
    subject: "Mathematics",
    edition: "1e",
    description:
      "Techniques of integration, differential equations, sequences and series, power series, Taylor and Maclaurin series, and parametric equations with applications to physics and engineering.",
    pageUrl: "https://openstax.org/details/books/calculus-volume-2",
    year: 2016,
    categories: ["calculus", "mathematics"],
  },
  {
    title: "Calculus Volume 3",
    subject: "Mathematics",
    edition: "1e",
    description:
      "Multivariable calculus: vectors, vector-valued functions, partial derivatives, multiple integrals, line and surface integrals, and the theorems of Green, Stokes, and Gauss.",
    pageUrl: "https://openstax.org/details/books/calculus-volume-3",
    year: 2016,
    categories: ["multivariable calculus", "mathematics"],
  },
  {
    title: "Introductory Statistics",
    subject: "Mathematics",
    edition: "1e",
    description:
      "Statistical thinking and methods: descriptive statistics, probability, discrete and continuous distributions, sampling distributions, hypothesis testing, confidence intervals, regression analysis, and chi-square tests.",
    pageUrl: "https://openstax.org/details/books/introductory-statistics",
    year: 2013,
    categories: ["statistics", "mathematics"],
  },
  {
    title: "Statistics",
    subject: "Mathematics",
    edition: "1e",
    description:
      "Modern statistical methods for data analysis: exploratory data analysis, probability, inference, regression, ANOVA, and nonparametric methods. Emphasis on interpreting results in real-world contexts using technology.",
    pageUrl: "https://openstax.org/details/books/statistics",
    year: 2023,
    categories: ["statistics", "data science"],
  },
  {
    title: "Contemporary Mathematics",
    subject: "Mathematics",
    edition: "1e",
    description:
      "Mathematics for the liberal arts: logic, set theory, financial mathematics, statistics, probability, voting theory, graph theory, and geometry. Emphasizes mathematical reasoning in everyday contexts.",
    pageUrl: "https://openstax.org/details/books/contemporary-mathematics",
    year: 2023,
    categories: ["mathematics", "quantitative reasoning"],
  },
  {
    title: "College Algebra with Corequisite Support 2e",
    subject: "Mathematics",
    edition: "2e",
    description:
      "College algebra with integrated corequisite support for underprepared students: functions, graphing, polynomials, rational functions, exponential and logarithmic functions, systems of equations, and conic sections.",
    pageUrl:
      "https://openstax.org/details/books/college-algebra-corequisite-support-2e",
    year: 2021,
    categories: ["algebra", "mathematics"],
  },
  // SCIENCE
  {
    title: "Astronomy 2e",
    subject: "Science",
    edition: "2e",
    description:
      "Survey of modern astronomy: the solar system, stellar evolution, galaxies, cosmology, and the search for life in the universe. Covers observational techniques, space missions, and the physical laws governing celestial objects.",
    pageUrl: "https://openstax.org/details/books/astronomy-2e",
    year: 2022,
    categories: ["astronomy", "astrophysics"],
  },
  {
    title: "Biology 2e",
    subject: "Science",
    edition: "2e",
    description:
      "Comprehensive introductory biology: the chemistry of life, cell structure and function, genetics, evolution, ecology, and diversity of life from bacteria to plants and animals.",
    pageUrl: "https://openstax.org/details/books/biology-2e",
    year: 2018,
    categories: ["biology", "life sciences"],
  },
  {
    title: "Concepts of Biology",
    subject: "Science",
    edition: "1e",
    description:
      "Accessible introduction to biology for non-majors: the science of life, cell biology, genetics, evolution, ecology, and the diversity of organisms. Emphasizes critical thinking and real-world biological issues.",
    pageUrl: "https://openstax.org/details/books/concepts-of-biology",
    year: 2013,
    categories: ["biology", "life sciences"],
  },
  {
    title: "Microbiology",
    subject: "Science",
    edition: "1e",
    description:
      "Microbial world: bacterial cell structure, metabolism, genetics, microbial ecology, infectious diseases, antimicrobials, and the immune system response to microbial pathogens. Aligned with ASMCUE guidelines.",
    pageUrl: "https://openstax.org/details/books/microbiology",
    year: 2016,
    categories: ["microbiology", "biology"],
  },
  {
    title: "Anatomy and Physiology 2e",
    subject: "Science",
    edition: "2e",
    description:
      "Structure and function of the human body: cells and tissues, the integumentary, skeletal, muscular, nervous, endocrine, cardiovascular, lymphatic, respiratory, digestive, urinary, and reproductive systems.",
    pageUrl: "https://openstax.org/details/books/anatomy-and-physiology-2e",
    year: 2022,
    categories: ["anatomy", "physiology"],
  },
  {
    title: "Chemistry 2e",
    subject: "Science",
    edition: "2e",
    description:
      "Introductory chemistry: atomic structure, bonding, stoichiometry, thermodynamics, kinetics, equilibrium, electrochemistry, nuclear chemistry, and an introduction to organic chemistry.",
    pageUrl: "https://openstax.org/details/books/chemistry-2e",
    year: 2019,
    categories: ["chemistry", "physical sciences"],
  },
  {
    title: "Chemistry: Atoms First 2e",
    subject: "Science",
    edition: "2e",
    description:
      "Atoms-first approach to chemistry: atomic theory, electronic structure, bonding, molecular geometry, intermolecular forces, thermodynamics, kinetics, and equilibrium. Builds chemical understanding from atomic principles.",
    pageUrl: "https://openstax.org/details/books/chemistry-atoms-first-2e",
    year: 2019,
    categories: ["chemistry", "physical sciences"],
  },
  {
    title: "Organic Chemistry",
    subject: "Science",
    edition: "1e",
    description:
      "Systematic study of organic compounds: structure, bonding, stereochemistry, reaction mechanisms, and synthesis of major functional group classes including alkanes, alkenes, alkynes, aromatics, aldehydes, ketones, and biological molecules.",
    pageUrl: "https://openstax.org/details/books/organic-chemistry",
    year: 2023,
    categories: ["organic chemistry", "chemistry"],
  },
  {
    title: "College Physics 2e",
    subject: "Science",
    edition: "2e",
    description:
      "Algebra-based introductory physics: kinematics, Newton's laws, energy, momentum, rotational motion, fluids, thermodynamics, waves, electricity, magnetism, optics, and modern physics. Strong emphasis on real-world applications.",
    pageUrl: "https://openstax.org/details/books/college-physics-2e",
    year: 2022,
    categories: ["physics", "physical sciences"],
  },
  {
    title: "University Physics Volume 1",
    subject: "Science",
    edition: "1e",
    description:
      "Calculus-based classical mechanics: units and vectors, kinematics, Newton's laws, work and energy, momentum, rotational motion, static equilibrium, gravitation, oscillations, and waves.",
    pageUrl: "https://openstax.org/details/books/university-physics-volume-1",
    year: 2016,
    categories: ["physics", "mechanics"],
  },
  {
    title: "University Physics Volume 2",
    subject: "Science",
    edition: "1e",
    description:
      "Electricity and magnetism: electric charge and field, Gauss's law, electric potential, capacitance, current and resistance, circuits, magnetic fields, electromagnetic induction, Maxwell's equations, and electromagnetic waves.",
    pageUrl: "https://openstax.org/details/books/university-physics-volume-2",
    year: 2016,
    categories: ["physics", "electromagnetism"],
  },
  {
    title: "University Physics Volume 3",
    subject: "Science",
    edition: "1e",
    description:
      "Optics and modern physics: geometric and wave optics, interference, diffraction, special relativity, photons, quantum mechanics, atomic structure, nuclear physics, and particle physics.",
    pageUrl: "https://openstax.org/details/books/university-physics-volume-3",
    year: 2016,
    categories: ["physics", "modern physics"],
  },
  {
    title: "Nutrition Science and Practice",
    subject: "Science",
    edition: "1e",
    description:
      "Fundamentals of nutrition: macronutrients, micronutrients, digestion and absorption, energy metabolism, dietary assessment, nutrition across the lifespan, and the relationship between diet and chronic disease.",
    pageUrl:
      "https://openstax.org/details/books/nutrition-science-and-practice",
    year: 2022,
    categories: ["nutrition", "health sciences"],
  },
  // SOCIAL SCIENCES
  {
    title: "American Government 3e",
    subject: "Social Sciences",
    edition: "3e",
    description:
      "American political institutions and processes: the founding, the Constitution, federalism, civil liberties, political parties, elections, Congress, the Presidency, the courts, and public policy.",
    pageUrl: "https://openstax.org/details/books/american-government-3e",
    year: 2021,
    categories: ["political science", "american government"],
  },
  {
    title: "Introduction to Political Science",
    subject: "Social Sciences",
    edition: "1e",
    description:
      "Foundational concepts in political science: political theory, comparative politics, international relations, and political institutions. Explores democracy, authoritarianism, political economy, and global governance.",
    pageUrl:
      "https://openstax.org/details/books/introduction-political-science",
    year: 2022,
    categories: ["political science"],
  },
  {
    title: "Introduction to Sociology 3e",
    subject: "Social Sciences",
    edition: "3e",
    description:
      "Sociological perspectives and methods: culture, socialization, social interaction, groups, deviance, social stratification, race and ethnicity, gender, family, education, religion, and global inequality.",
    pageUrl: "https://openstax.org/details/books/introduction-sociology-3e",
    year: 2021,
    categories: ["sociology", "social sciences"],
  },
  {
    title: "Introduction to Philosophy",
    subject: "Social Sciences",
    edition: "1e",
    description:
      "Core philosophical questions: ethics, political philosophy, epistemology, philosophy of mind, metaphysics, logic, and aesthetics. Engages both historical texts and contemporary philosophical arguments.",
    pageUrl: "https://openstax.org/details/books/introduction-philosophy",
    year: 2022,
    categories: ["philosophy"],
  },
  {
    title: "Psychology 2e",
    subject: "Social Sciences",
    edition: "2e",
    description:
      "Scientific study of behavior and mental processes: biological bases of behavior, sensation and perception, states of consciousness, learning, memory, cognition, development, personality, social psychology, and psychological disorders.",
    pageUrl: "https://openstax.org/details/books/psychology-2e",
    year: 2019,
    categories: ["psychology", "social sciences"],
  },
  {
    title: "Lifespan Development",
    subject: "Social Sciences",
    edition: "1e",
    description:
      "Human development from conception through death: prenatal development, infancy, childhood, adolescence, adulthood, and aging. Covers biological, cognitive, and socioemotional development across the lifespan.",
    pageUrl: "https://openstax.org/details/books/lifespan-development",
    year: 2023,
    categories: ["developmental psychology", "psychology"],
  },
  {
    title: "Introduction to Intellectual Property",
    subject: "Social Sciences",
    edition: "1e",
    description:
      "Foundations of intellectual property law: patents, copyrights, trademarks, and trade secrets. Covers the economic rationale, international treaties, and contemporary issues in digital and biological IP.",
    pageUrl:
      "https://openstax.org/details/books/introduction-intellectual-property",
    year: 2023,
    categories: ["intellectual property", "law"],
  },
  // HUMANITIES
  {
    title: "U.S. History",
    subject: "Humanities",
    edition: "1e",
    description:
      "American history from pre-Columbian civilizations to the present: the colonial era, Revolution and founding, antebellum America, Civil War and Reconstruction, industrialization, the World Wars, civil rights, and contemporary America.",
    pageUrl: "https://openstax.org/details/books/us-history",
    year: 2014,
    categories: ["history", "american history"],
  },
  {
    title: "World History, Volume I: to 1500",
    subject: "Humanities",
    edition: "1e",
    description:
      "Global history from the emergence of humans to 1500 CE: ancient civilizations, classical empires, world religions, medieval societies, and the interconnected networks of trade and culture in the pre-modern world.",
    pageUrl: "https://openstax.org/details/books/world-history-volume-1",
    year: 2023,
    categories: ["history", "world history"],
  },
  {
    title: "World History, Volume II: from 1400",
    subject: "Humanities",
    edition: "1e",
    description:
      "Global history from 1400 to the present: the Renaissance, Age of Exploration, Scientific Revolution, Enlightenment, industrialization, imperialism, World Wars, decolonization, the Cold War, and globalization.",
    pageUrl: "https://openstax.org/details/books/world-history-volume-2",
    year: 2023,
    categories: ["history", "world history"],
  },
  {
    title: "Writing Guide with Handbook",
    subject: "Humanities",
    edition: "1e",
    description:
      "Writing for college and beyond: rhetorical analysis, research writing, argument, narrative, literary analysis, and professional writing. Includes a comprehensive handbook of grammar, style, and documentation formats.",
    pageUrl: "https://openstax.org/details/books/writing-guide",
    year: 2021,
    categories: ["writing", "english composition"],
  },
  // BUSINESS AND ECONOMICS
  {
    title: "Principles of Microeconomics 3e",
    subject: "Business",
    edition: "3e",
    description:
      "Microeconomic principles: supply and demand, consumer behavior, firm theory, market structures, factor markets, market failure, and public policy. Applies economic reasoning to everyday decisions.",
    pageUrl:
      "https://openstax.org/details/books/principles-microeconomics-3e",
    year: 2022,
    categories: ["microeconomics", "economics"],
  },
  {
    title: "Principles of Macroeconomics 3e",
    subject: "Business",
    edition: "3e",
    description:
      "Macroeconomic principles: GDP, unemployment, inflation, monetary policy, fiscal policy, international trade, and economic growth. Covers business cycles, the banking system, and macroeconomic modeling.",
    pageUrl:
      "https://openstax.org/details/books/principles-macroeconomics-3e",
    year: 2022,
    categories: ["macroeconomics", "economics"],
  },
  {
    title: "Principles of Economics 3e",
    subject: "Business",
    edition: "3e",
    description:
      "Comprehensive introduction to economics: the economic way of thinking, demand and supply, firm behavior, market structures, macroeconomic measurement, aggregate demand and supply, money, banking, and international economics.",
    pageUrl: "https://openstax.org/details/books/principles-economics-3e",
    year: 2022,
    categories: ["economics"],
  },
  {
    title: "Introductory Business Statistics 2e",
    subject: "Business",
    edition: "2e",
    description:
      "Statistical methods for business and economics: descriptive statistics, probability, sampling distributions, confidence intervals, hypothesis testing, regression analysis, and time series analysis with business applications.",
    pageUrl:
      "https://openstax.org/details/books/introductory-business-statistics-2e",
    year: 2023,
    categories: ["statistics", "business"],
  },
  {
    title: "Introduction to Business",
    subject: "Business",
    edition: "1e",
    description:
      "Overview of the business world: economic systems, business ownership, management, human resources, marketing, financial management, accounting, information technology, and the global business environment.",
    pageUrl: "https://openstax.org/details/books/introduction-business",
    year: 2018,
    categories: ["business", "management"],
  },
  {
    title: "Business Ethics",
    subject: "Business",
    edition: "1e",
    description:
      "Ethical decision-making in business: ethical frameworks, corporate social responsibility, stakeholder theory, environmental ethics, diversity and inclusion, and ethical leadership in the global economy.",
    pageUrl: "https://openstax.org/details/books/business-ethics",
    year: 2018,
    categories: ["business ethics", "ethics"],
  },
  {
    title: "Organizational Behavior",
    subject: "Business",
    edition: "1e",
    description:
      "Human behavior in organizations: individual behavior, motivation, perception, decision-making, group dynamics, leadership, power and politics, conflict, organizational culture, and change management.",
    pageUrl: "https://openstax.org/details/books/organizational-behavior",
    year: 2019,
    categories: ["organizational behavior", "management"],
  },
  {
    title: "Principles of Management",
    subject: "Business",
    edition: "1e",
    description:
      "Fundamentals of management: the history of management, planning, organizing, leading, and controlling. Covers decision-making, organizational design, human resource management, leadership, and strategic management.",
    pageUrl: "https://openstax.org/details/books/principles-management",
    year: 2019,
    categories: ["management", "business"],
  },
  {
    title: "Principles of Marketing",
    subject: "Business",
    edition: "1e",
    description:
      "Marketing concepts and strategy: market research, consumer behavior, segmentation and targeting, product development, pricing strategies, distribution channels, integrated marketing communications, and digital marketing.",
    pageUrl: "https://openstax.org/details/books/principles-marketing",
    year: 2023,
    categories: ["marketing", "business"],
  },
  {
    title: "Entrepreneurship",
    subject: "Business",
    edition: "1e",
    description:
      "Creating and managing a new venture: opportunity recognition, business planning, entrepreneurial finance, marketing for startups, managing growth, and the social and ethical dimensions of entrepreneurship.",
    pageUrl: "https://openstax.org/details/books/entrepreneurship",
    year: 2020,
    categories: ["entrepreneurship", "business"],
  },
  {
    title: "Principles of Accounting, Volume 1: Financial Accounting",
    subject: "Business",
    edition: "1e",
    description:
      "Financial accounting principles: the accounting cycle, financial statements, assets, liabilities, equity, revenue recognition, inventory, and long-term assets. Emphasizes decision-making using financial information.",
    pageUrl:
      "https://openstax.org/details/books/principles-financial-accounting",
    year: 2019,
    categories: ["accounting", "finance"],
  },
  {
    title: "Principles of Accounting, Volume 2: Managerial Accounting",
    subject: "Business",
    edition: "1e",
    description:
      "Managerial accounting for business decisions: cost behavior, cost-volume-profit analysis, budgeting, standard costs, relevant costs, capital budgeting, and responsibility accounting.",
    pageUrl:
      "https://openstax.org/details/books/principles-managerial-accounting",
    year: 2019,
    categories: ["accounting", "management"],
  },
  {
    title: "Business Law I Essentials",
    subject: "Business",
    edition: "1e",
    description:
      "Legal framework for business: the American legal system, torts, contracts, intellectual property, employment law, business organizations, consumer protection, and environmental regulation.",
    pageUrl: "https://openstax.org/details/books/business-law-i-essentials",
    year: 2019,
    categories: ["business law", "law"],
  },
  {
    title: "Principles of Finance",
    subject: "Business",
    edition: "1e",
    description:
      "Financial principles for decision-making: time value of money, risk and return, capital markets, valuation, capital budgeting, capital structure, dividend policy, and working capital management.",
    pageUrl: "https://openstax.org/details/books/principles-finance",
    year: 2022,
    categories: ["finance", "business"],
  },
];

// ─── Fake Users ───────────────────────────────────────────────────────────────

const DICEBEAR_STYLES = [
  "adventurer",
  "adventurer-neutral",
  "avataaars",
  "avataaars-neutral",
  "big-ears",
  "big-ears-neutral",
  "big-smile",
  "bottts",
  "bottts-neutral",
  "croodles",
  "croodles-neutral",
  "dylan",
  "fun-emoji",
  "glass",
  "icons",
  "identicon",
  "initials",
  "lorelei",
  "lorelei-neutral",
  "micah",
  "miniavs",
  "notionists",
  "notionists-neutral",
  "open-peeps",
  "personas",
  "pixel-art",
  "pixel-art-neutral",
  "rings",
  "shapes",
  "thumbs",
];

const SEED_USERS = [
  // prolific curator — 20 posts, premium badge
  {
    username: "openstax_curator",
    displayName: "OpenStax Curator",
    email: "curator@openstax.example.com",
    institution: "Rice University",
    program: "OpenStax Initiative",
    plan: "premium",
    prolific: true,
  },
  {
    username: "li_wei_math",
    displayName: "Li Wei",
    email: "li.wei@example.com",
    institution: "Fudan University",
    program: "Mathematics",
    plan: "pro",
    prolific: false,
  },
  {
    username: "amelia_brooks",
    displayName: "Amelia Brooks",
    email: "amelia.brooks@example.com",
    institution: "University of Melbourne",
    program: "Biology",
    plan: "free",
    prolific: false,
  },
  {
    username: "kofi_asante",
    displayName: "Kofi Asante",
    email: "kofi.asante@example.com",
    institution: "University of Cape Town",
    program: "Economics",
    plan: "premium",
    prolific: false,
  },
  {
    username: "valentina_russo",
    displayName: "Valentina Russo",
    email: "valentina.russo@example.com",
    institution: "Università di Bologna",
    program: "Chemistry",
    plan: "pro",
    prolific: false,
  },
  {
    username: "arjun_nair",
    displayName: "Arjun Nair",
    email: "arjun.nair@example.com",
    institution: "Indian Institute of Science",
    program: "Physics",
    plan: "free",
    prolific: false,
  },
  {
    username: "saoirse_murphy",
    displayName: "Saoirse Murphy",
    email: "saoirse.murphy@example.com",
    institution: "University College Dublin",
    program: "Psychology",
    plan: "pro",
    prolific: false,
  },
  {
    username: "hassan_al_farsi",
    displayName: "Hassan Al-Farsi",
    email: "hassan.alfarsi@example.com",
    institution: "Sultan Qaboos University",
    program: "Accounting",
    plan: "free",
    prolific: false,
  },
  {
    username: "elena_popescu",
    displayName: "Elena Popescu",
    email: "elena.popescu@example.com",
    institution: "University of Bucharest",
    program: "Sociology",
    plan: "pro",
    prolific: false,
  },
  {
    username: "tunde_adeyemi",
    displayName: "Tunde Adeyemi",
    email: "tunde.adeyemi@example.com",
    institution: "University of Ibadan",
    program: "Political Science",
    plan: "free",
    prolific: false,
  },
  {
    username: "ingrid_bjornstad",
    displayName: "Ingrid Bjørnstad",
    email: "ingrid.bjornstad@example.com",
    institution: "University of Oslo",
    program: "Statistics",
    plan: "premium",
    prolific: false,
  },
  {
    username: "pablo_herrera",
    displayName: "Pablo Herrera",
    email: "pablo.herrera@example.com",
    institution: "Universidad de Chile",
    program: "Finance",
    plan: "pro",
    prolific: false,
  },
  {
    username: "nadia_hassan",
    displayName: "Nadia Hassan",
    email: "nadia.hassan@example.com",
    institution: "Cairo University",
    program: "Microbiology",
    plan: "free",
    prolific: false,
  },
  {
    username: "kenji_watanabe",
    displayName: "Kenji Watanabe",
    email: "kenji.watanabe@example.com",
    institution: "Osaka University",
    program: "Organic Chemistry",
    plan: "pro",
    prolific: false,
  },
  {
    username: "blessing_okon",
    displayName: "Blessing Okon",
    email: "blessing.okon@example.com",
    institution: "University of Port Harcourt",
    program: "Anatomy and Physiology",
    plan: "free",
    prolific: false,
  },
  {
    username: "ana_gonzalez",
    displayName: "Ana González",
    email: "ana.gonzalez@example.com",
    institution: "Universidad Autónoma de Madrid",
    program: "History",
    plan: "premium",
    prolific: false,
  },
  {
    username: "ravi_sharma",
    displayName: "Ravi Sharma",
    email: "ravi.sharma@example.com",
    institution: "University of Delhi",
    program: "Business Administration",
    plan: "pro",
    prolific: false,
  },
  {
    username: "chidi_obi",
    displayName: "Chidi Obi",
    email: "chidi.obi@example.com",
    institution: "University of Nigeria",
    program: "Philosophy",
    plan: "free",
    prolific: false,
  },
  {
    username: "astrid_lindqvist",
    displayName: "Astrid Lindqvist",
    email: "astrid.lindqvist@example.com",
    institution: "Lund University",
    program: "Environmental Science",
    plan: "pro",
    prolific: false,
  },
  {
    username: "moussa_diawara",
    displayName: "Moussa Diawara",
    email: "moussa.diawara@example.com",
    institution: "Université de Conakry",
    program: "Economics",
    plan: "free",
    prolific: false,
  },
  {
    username: "mei_zhang_bio",
    displayName: "Mei Zhang",
    email: "mei.zhang.bio@example.com",
    institution: "Zhejiang University",
    program: "Biomedical Sciences",
    plan: "pro",
    prolific: false,
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── arxiv Paper Search ───────────────────────────────────────────────────────
// For each book we search arxiv by title keywords, download the best match,
// and upload it to the private S3 bucket. Each post gets its own unique PDF
// that actually matches its title instead of sharing a per-subject fallback.

// Used when no arxiv match is found — one sensible paper per subject.
const SUBJECT_PDF_FALLBACK: Record<string, string> = {
  Mathematics: "https://arxiv.org/pdf/1911.01464",
  Science: "https://arxiv.org/pdf/2212.08013",
  "Social Sciences": "https://arxiv.org/pdf/2207.09049",
  Humanities: "https://arxiv.org/pdf/1810.04805",
  Business: "https://arxiv.org/pdf/2207.09049",
};
const LAST_RESORT_PDF = "https://arxiv.org/pdf/1706.03762";

// arxiv subject category per OpenStax subject for more precise search results.
const ARXIV_CAT_BY_SUBJECT: Record<string, string> = {
  Mathematics: "math",
  Science: "physics",
  "Social Sciences": "econ",
  Humanities: "cs.CL",
  Business: "econ",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "for",
  "on",
  "with",
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "1e",
  "2e",
  "3e",
  "volume",
  "introduction",
  "principles",
  "fundamentals",
  "advanced",
  "topics",
  "applied",
]);

function titleToSearchTerms(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 5)
    .join(" ");
}

async function searchArxivPdf(
  bookTitle: string,
  subject: string,
): Promise<string | null> {
  const terms = titleToSearchTerms(bookTitle);
  if (!terms) return null;

  const cat = ARXIV_CAT_BY_SUBJECT[subject] ?? "";
  const catClause = cat ? `+AND+cat:${cat}` : "";
  const q = `ti:${encodeURIComponent(terms)}${catClause}`;
  const url = `https://export.arxiv.org/api/query?search_query=${q}&max_results=1&sortBy=relevance&sortOrder=descending`;

  const res = await fetch(url, {
    headers: { "User-Agent": "MaterialCrate-Seeder/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const idMatch = xml.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<\s]+)<\/id>/);
  if (!idMatch) return null;

  // strip version suffix (e.g. 1706.03762v7 → 1706.03762)
  return `https://arxiv.org/pdf/${idMatch[1].replace(/v\d+$/, "")}`;
}

// ─── Per-Book S3 PDF Upload ───────────────────────────────────────────────────

async function ensureBookPdfsOnS3(
  books: Array<{ title: string; subject: string }>,
): Promise<Map<string, string>> {
  const bucket = process.env.AWS_S3_PRIVATE_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    throw new Error(
      "AWS_S3_PRIVATE_BUCKET and AWS_REGION must be set in .env.",
    );
  }

  const result = new Map<string, string>(); // title → s3Url
  console.log(`Ensuring PDFs for ${books.length} books...`);

  for (const { title, subject } of books) {
    const slug = sanitizeName(title).slice(0, 80);
    const key = `documents/seed-openstax-${slug}.pdf`;
    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    // Idempotent: skip if the file is already in S3.
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      result.set(title, s3Url);
      continue;
    } catch {
      // Not found — fall through to upload.
    }

    // 1. Try to find a title-matching paper on arxiv.
    let sourceUrl: string | null = null;
    try {
      sourceUrl = await searchArxivPdf(title, subject);
    } catch {
      /* search failed — use fallback */
    }

    // 2. Fall back to the subject-level paper if arxiv found nothing.
    if (!sourceUrl)
      sourceUrl = SUBJECT_PDF_FALLBACK[subject] ?? LAST_RESORT_PDF;

    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "MaterialCrate-Seeder/1.0" },
        signal: AbortSignal.timeout(45000),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: "application/pdf",
        }),
      );
      process.stdout.write(
        `  PDF: "${title.slice(0, 48)}" (${(buffer.length / 1024).toFixed(0)} KB)\n`,
      );
      result.set(title, s3Url);
    } catch (err) {
      // 3. Last resort: download the fallback paper itself.
      console.warn(
        `  PDF failed "${title}": ${(err as Error).message} — retrying with fallback`,
      );
      try {
        const fb = await fetch(LAST_RESORT_PDF, {
          headers: { "User-Agent": "MaterialCrate-Seeder/1.0" },
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        });
        const buf = Buffer.from(await fb.arrayBuffer());
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buf,
            ContentType: "application/pdf",
          }),
        );
        result.set(title, s3Url);
      } catch {
        result.set(
          title,
          `https://${bucket}.s3.${region}.amazonaws.com/documents/seed-openstax-fallback.pdf`,
        );
      }
    }

    // Pace: arxiv asks for ≤3 req/sec and we're also downloading PDFs.
    await new Promise((r) => setTimeout(r, 1200));
  }

  return result;
}

// ─── PDF Thumbnail Generation ─────────────────────────────────────────────────
// Renders the first page of each book's PDF and uploads the JPEG to the
// public S3 bucket, matching the real createPost thumbnail flow exactly.

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(
    obj: ReturnType<NodeCanvasFactory["create"]>,
    width: number,
    height: number,
  ) {
    obj.canvas.width = width;
    obj.canvas.height = height;
  }
  destroy(obj: ReturnType<NodeCanvasFactory["create"]>) {
    obj.canvas.width = 0;
    obj.canvas.height = 0;
  }
}

async function pdfFirstPageToJpeg(pdfBuffer: Buffer): Promise<Buffer> {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const factory = new NodeCanvasFactory();
  const canvasObj = factory.create(
    Math.floor(viewport.width),
    Math.floor(viewport.height),
  );

  await page.render({
    canvasContext: canvasObj.context as any,
    viewport,
    canvasFactory: factory as any,
  }).promise;

  const pngBuffer = canvasObj.canvas.toBuffer("image/png");
  factory.destroy(canvasObj);

  // Resize to max 800px wide and convert to JPEG — same quality level the app uses
  return sharp(pngBuffer)
    .resize(800, null, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function generateBookThumbnails(
  books: Array<{ title: string }>,
): Promise<Map<string, string>> {
  const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
  const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET;
  const cfBase = (process.env.CLOUDFRONT_URL ?? "").replace(/\/$/, "");
  const result = new Map<string, string>();

  if (!publicBucket || !privateBucket || !cfBase) {
    console.warn(
      "  S3 or CloudFront env vars missing — thumbnails will be null.",
    );
    return result;
  }

  console.log(`Generating thumbnails for ${books.length} books...`);

  for (const { title } of books) {
    const slug = sanitizeName(title).slice(0, 80);
    const thumbKey = `thumbnails/seed-openstax-${slug}.jpg`;
    const cfUrl = `${cfBase}/${thumbKey}`;

    try {
      await s3.send(
        new HeadObjectCommand({ Bucket: publicBucket, Key: thumbKey }),
      );
      result.set(title, cfUrl);
      continue;
    } catch {
      // Not found — generate
    }

    const pdfKey = `documents/seed-openstax-${slug}.pdf`;
    try {
      const getRes = await s3.send(
        new GetObjectCommand({ Bucket: privateBucket, Key: pdfKey }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of getRes.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const jpegBuffer = await pdfFirstPageToJpeg(Buffer.concat(chunks));
      await s3.send(
        new PutObjectCommand({
          Bucket: publicBucket,
          Key: thumbKey,
          Body: jpegBuffer,
          ContentType: "image/jpeg",
        }),
      );
      process.stdout.write(`  Thumbnail: "${title.slice(0, 50)}"\n`);
      result.set(title, cfUrl);
    } catch (err) {
      console.warn(`  Thumbnail failed "${title}": ${(err as Error).message}`);
    }
  }

  return result;
}

// ─── OpenStax Live Scraper (best-effort) ──────────────────────────────────────

async function scrapeOpenStaxBooks(): Promise<OpenStaxBook[]> {
  const scraped: OpenStaxBook[] = [];

  try {
    // OpenStax exposes a Wagtail CMS API — try the books endpoint.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(
      "https://openstax.org/api/v2/pages/?type=books.Book&fields=title,description,slug,subjects,edition,publish_date&order=title&limit=250",
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "MaterialCrate-Seeder/1.0",
          Accept: "application/json",
        },
      },
    );
    clearTimeout(timer);

    if (res.ok) {
      const json = await res.json();
      const items: Record<string, unknown>[] = json?.items ?? [];

      for (const item of items) {
        const title = (item["title"] as string | undefined)?.trim();
        const slug = item["slug"] as string | undefined;
        const description = (item["description"] as string | undefined)?.trim();
        const subjectsRaw = item["subjects"] as
          | { name?: string }[]
          | undefined;
        const edition = (item["edition"] as string | undefined) ?? "";
        const publishDate = (item["publish_date"] as string | undefined) ?? "";
        const yearMatch = publishDate.match(/\d{4}/);

        if (!title || !slug) continue;
        if (BOOKS.some((b) => b.title === title)) continue;

        const subject =
          subjectsRaw?.[0]?.name ?? "Science";

        scraped.push({
          title,
          subject,
          edition,
          description: description ?? `OpenStax textbook: ${title}.`,
          pageUrl: `https://openstax.org/details/books/${slug}`,
          year: yearMatch ? parseInt(yearMatch[0]) : 2020,
          categories: [subject.toLowerCase(), "open textbook"],
        });
      }
    }
  } catch {
    // API unavailable — fall back to scraping the subjects page HTML.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("https://openstax.org/subjects", {
        signal: controller.signal,
        headers: {
          "User-Agent": "MaterialCrate-Seeder/1.0",
          Accept: "text/html",
        },
      });
      clearTimeout(timer);

      if (res.ok) {
        const html = await res.text();
        const match = html.match(
          /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
        );
        if (match) {
          const data = JSON.parse(match[1]);
          const books: Record<string, unknown>[] =
            data?.props?.pageProps?.books ?? [];

          for (const b of books) {
            const title = (b["title"] as string | undefined)?.trim();
            const slug = b["meta"]?.["slug"] as string | undefined ?? b["slug"] as string | undefined;
            if (!title || !slug) continue;
            if (BOOKS.some((hb) => hb.title === title)) continue;

            const subjectsRaw = b["subjects"] as { name?: string }[] | undefined;
            const subject = subjectsRaw?.[0]?.name ?? "Science";

            scraped.push({
              title,
              subject,
              edition: (b["edition"] as string | undefined) ?? "",
              description:
                (b["description"] as string | undefined) ??
                `OpenStax open textbook: ${title}.`,
              pageUrl: `https://openstax.org/details/books/${slug}`,
              year: 2020,
              categories: [subject.toLowerCase(), "open textbook"],
            });
          }
        }
      }
    } catch {
      // swallow — fall through to hardcoded data
    }
  }

  return scraped;
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed() {
  const existingCount = await prisma.post.count();
  console.log(
    `Database has ${existingCount} existing posts — adding OpenStax posts alongside them.`,
  );

  if (process.argv.includes("--reset")) {
    console.log("--reset: removing previous seed users and their posts...");
    await prisma.user.deleteMany({
      where: { email: { in: SEED_USERS.map((u) => u.email) } },
    });
  }

  // ── Scrape additional books ──
  console.log("Attempting live scrape from OpenStax...");
  const scraped = await scrapeOpenStaxBooks();
  console.log(`Scraped ${scraped.length} additional books.`);
  const allBooks = [...BOOKS, ...scraped];
  console.log(`Total books available: ${allBooks.length}`);

  // ── Hash shared password ──
  const passwordHash = await bcrypt.hash("SeedPassword123!", 10);

  // ── Create or reuse users ──
  console.log("Creating users (skipping any that already exist)...");
  const createdUsers = await Promise.all(
    SEED_USERS.map(async (u, idx) => {
      const existing = await prisma.user.findFirst({
        where: { email: u.email },
      });
      if (existing) {
        console.log(`  Reusing existing user: ${u.email}`);
        return existing;
      }
      const style = DICEBEAR_STYLES[idx % DICEBEAR_STYLES.length];
      const profilePicture = `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(u.username)}&size=200`;
      return prisma.user.create({
        data: {
          username: u.username,
          displayName: u.displayName,
          email: u.email,
          password: passwordHash,
          emailVerified: true,
          institution: u.institution,
          program: u.program,
          subscriptionPlan: u.plan,
          profilePicture,
        },
      });
    }),
  );

  // ── Seed follow relationships ──
  console.log("Seeding follow relationships...");
  {
    // Weight: premium/prolific users attract more followers
    const weights = createdUsers.map((_, i) => {
      const u = SEED_USERS[i];
      if (u.prolific) return 5;
      if (u.plan === "premium") return 3;
      if (u.plan === "pro") return 2;
      return 1;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    function pickFollowTarget(excludeIdx: number): number {
      let r = Math.random() * totalWeight;
      for (let i = 0; i < weights.length; i++) {
        if (i === excludeIdx) continue;
        r -= weights[i];
        if (r <= 0) return i;
      }
      // fallback: pick any other user
      return excludeIdx === 0 ? 1 : 0;
    }

    const followPairs: Array<{ followerId: string; followingId: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < createdUsers.length; i++) {
      // Each user follows between 5 and 14 others
      const count = 5 + Math.floor(Math.random() * 10);
      const targets = new Set<number>();
      let attempts = 0;
      while (
        targets.size < Math.min(count, createdUsers.length - 1) &&
        attempts < 100
      ) {
        targets.add(pickFollowTarget(i));
        attempts++;
      }
      for (const j of targets) {
        const key = `${createdUsers[i].id}:${createdUsers[j].id}`;
        if (!seen.has(key)) {
          seen.add(key);
          followPairs.push({
            followerId: createdUsers[i].id,
            followingId: createdUsers[j].id,
          });
        }
      }
    }

    await prisma.follow.createMany({ data: followPairs, skipDuplicates: true });
    console.log(`  Created ${followPairs.length} follow relationships.`);
  }

  const prolificUser = createdUsers.find((_, i) => SEED_USERS[i].prolific)!;
  const regularUsers = createdUsers.filter((u) => u.id !== prolificUser.id);

  // ── Distribute books: prolific gets first 20, rest split among regulars ──
  const shuffled = [...allBooks].sort(() => Math.random() - 0.5);
  const prolificBooks = shuffled.slice(0, 20);
  const remaining = shuffled.slice(20);

  type Assignment = { user: (typeof createdUsers)[0]; book: OpenStaxBook };
  const assignments: Assignment[] = prolificBooks.map((book) => ({
    user: prolificUser,
    book,
  }));

  remaining.forEach((book, i) => {
    assignments.push({ user: regularUsers[i % regularUsers.length], book });
  });

  // ── Per-book PDFs then thumbnails (PDFs must exist before rendering) ──
  const bookList = assignments.map((a) => ({
    title: a.book.title,
    subject: a.book.subject,
  }));
  const fileUrlByBook = await ensureBookPdfsOnS3(bookList);
  const thumbnailByBook = await generateBookThumbnails(bookList);

  console.log(`Seeding ${assignments.length} posts...`);
  let count = 0;

  for (const { user, book } of assignments) {
    const thumbnailUrl = thumbnailByBook.get(book.title) ?? null;
    const fileUrl = fileUrlByBook.get(book.title)!;
    await prisma.post.create({
      data: {
        title: book.title,
        fileUrl,
        fileType: "pdf",
        thumbnailUrl,
        categories: book.categories,
        description: book.description,
        year: book.year,
        isFree: true,
        price: 0,
        authorId: user.id,
        versions: {
          create: {
            versionNumber: 1,
            title: book.title,
            categories: book.categories,
            description: book.description,
            year: book.year,
            fileUrl,
            thumbnailUrl,
            fileType: "pdf",
            editorId: user.id,
          },
        },
      },
    });

    count++;
    if (count % 10 === 0)
      process.stdout.write(`  ${count}/${assignments.length}\n`);
  }

  console.log(
    `\nDone! Created ${createdUsers.length} users and ${count} posts.`,
  );
  console.log(
    `  Prolific user: ${prolificUser.username} (${prolificBooks.length} posts)`,
  );
  console.log(
    `  Regular users: ${regularUsers.length} users sharing ${remaining.length} posts`,
  );
  console.log("\nSeed user credentials:");
  console.log("  Password for all: SeedPassword123!");
  SEED_USERS.forEach((u) => console.log(`  ${u.email}`));
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
