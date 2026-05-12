/**
 * MIT OpenCourseWare seed script
 * Run from server/: pnpm tsx prisma/seed-ocw.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import sharp from 'sharp';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

// pdfjs-dist@3 (legacy build) tries to require the old 'canvas' package to
// polyfill DOMMatrix / Path2D. That package doesn't build on Node v24.
// Set the globals from @napi-rs/canvas BEFORE requiring pdfjs so it skips
// its broken fallback entirely.
(globalThis as any).DOMMatrix ??= DOMMatrix;
(globalThis as any).Path2D ??= Path2D;
(globalThis as any).ImageData ??= ImageData;

const _require = createRequire(import.meta.url);
const pdfjsLib = _require('pdfjs-dist/legacy/build/pdf.js') as any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  responseChecksumValidation: 'WHEN_REQUIRED' as const,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface OcwCourse {
  title: string;
  department: string;
  courseNumber: string;
  description: string;
  fileUrl: string;
  thumbnailUrl?: string;
  year: number;
  categories: string[];
}

// ─── Hardcoded Course Data ────────────────────────────────────────────────────

const COURSES: OcwCourse[] = [
  // EECS
  { title: 'Introduction to Algorithms', department: 'Electrical Engineering and Computer Science', courseNumber: '6.006', description: 'Mathematical modeling of computational problems. Covers common algorithms, algorithmic paradigms, and data structures. Emphasizes the relationship between algorithms and programming, and introduces basic performance measures and analysis techniques.', fileUrl: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/', year: 2020, categories: ['algorithms', 'computer science'] },
  { title: 'Artificial Intelligence', department: 'Electrical Engineering and Computer Science', courseNumber: '6.034', description: 'Basic knowledge representation, problem solving, and learning methods of artificial intelligence. Students develop intelligent systems by assembling solutions to concrete computational problems.', fileUrl: 'https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/', year: 2010, categories: ['artificial intelligence', 'computer science'] },
  { title: 'Mathematics for Computer Science', department: 'Electrical Engineering and Computer Science', courseNumber: '6.042J', description: 'Elementary discrete mathematics for computer science and engineering: sets, relations, elementary graph theory, state machines, combinatorics, and probability.', fileUrl: 'https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-fall-2010/', year: 2010, categories: ['mathematics', 'computer science'] },
  { title: 'Design and Analysis of Algorithms', department: 'Electrical Engineering and Computer Science', courseNumber: '6.046J', description: 'Techniques for design and analysis of efficient algorithms emphasizing methods useful in practice. Topics include sorting, searching, randomized algorithms, graph algorithms, and computational complexity.', fileUrl: 'https://ocw.mit.edu/courses/6-046j-design-and-analysis-of-algorithms-spring-2015/', year: 2015, categories: ['algorithms', 'computer science'] },
  { title: 'Automata, Computability, and Complexity', department: 'Electrical Engineering and Computer Science', courseNumber: '6.045J', description: 'Relationships between computation and mathematical logic. Covers automata theory, computability, and NP-completeness, with emphasis on fundamental results and implications for computer science.', fileUrl: 'https://ocw.mit.edu/courses/6-045j-automata-computability-and-complexity-spring-2011/', year: 2011, categories: ['theory of computation', 'computer science'] },
  { title: 'Performance Engineering of Software Systems', department: 'Electrical Engineering and Computer Science', courseNumber: '6.172', description: 'Performance engineering techniques including algorithmic complexity, work-span analysis, parallel algorithms, cache efficiency, and compiler optimizations for high-performance software.', fileUrl: 'https://ocw.mit.edu/courses/6-172-performance-engineering-of-software-systems-fall-2018/', year: 2018, categories: ['software engineering', 'computer science'] },
  { title: 'Distributed Systems', department: 'Electrical Engineering and Computer Science', courseNumber: '6.824', description: 'Principles of distributed systems: fault tolerance, replication, and consistency. Topics include MapReduce, Raft consensus, Spanner, and blockchain systems.', fileUrl: 'https://ocw.mit.edu/courses/6-824-distributed-systems-spring-2020/', year: 2020, categories: ['distributed systems', 'computer science'] },
  { title: 'Operating System Engineering', department: 'Electrical Engineering and Computer Science', courseNumber: '6.828', description: 'Fundamental design and implementation ideas of modern operating systems: virtual memory, file systems, threads, context switches, kernels, and system calls.', fileUrl: 'https://ocw.mit.edu/courses/6-828-operating-system-engineering-fall-2018/', year: 2018, categories: ['operating systems', 'computer science'] },
  { title: 'Computer Systems Security', department: 'Electrical Engineering and Computer Science', courseNumber: '6.858', description: 'Design and implementation of secure computer systems. Lectures cover threat models, attacks that compromise security, and techniques for achieving security goals.', fileUrl: 'https://ocw.mit.edu/courses/6-858-computer-systems-security-fall-2014/', year: 2014, categories: ['security', 'computer science'] },
  { title: 'Computation Structures', department: 'Electrical Engineering and Computer Science', courseNumber: '6.004', description: 'Architecture of digital systems emphasizing structural principles common to a wide range of technologies. Topics include combinational circuits, computer organization, and assembly language.', fileUrl: 'https://ocw.mit.edu/courses/6-004-computation-structures-spring-2017/', year: 2017, categories: ['computer architecture', 'computer science'] },
  { title: 'Introduction to Machine Learning', department: 'Electrical Engineering and Computer Science', courseNumber: '6.036', description: 'Principles, algorithms, and applications of machine learning from a probabilistic and statistical viewpoint. Covers linear regression, classification, deep learning, and reinforcement learning.', fileUrl: 'https://ocw.mit.edu/courses/6-036-introduction-to-machine-learning-fall-2020/', year: 2020, categories: ['machine learning', 'data science'] },
  { title: 'Probabilistic Systems Analysis', department: 'Electrical Engineering and Computer Science', courseNumber: '6.041', description: 'Introduction to probability models, inference, and computation. Topics include probability spaces, random variables, distributions, Bayesian inference, and Markov chains.', fileUrl: 'https://ocw.mit.edu/courses/6-041-probabilistic-systems-analysis-fall-2010/', year: 2010, categories: ['probability', 'statistics'] },
  { title: 'Machine Learning for Healthcare', department: 'Electrical Engineering and Computer Science', courseNumber: '6.S897', description: 'Machine learning methods for healthcare applications including clinical notes, medical imaging, and electronic health records. Covers deep learning and causal inference in clinical settings.', fileUrl: 'https://ocw.mit.edu/courses/6-s897-machine-learning-for-healthcare-spring-2019/', year: 2019, categories: ['machine learning', 'data science'] },
  { title: 'Circuits and Electronics', department: 'Electrical Engineering and Computer Science', courseNumber: '6.002', description: 'Introduction to engineering using the lumped circuit abstraction. Topics include resistive networks, transients, and sinusoidal steady state, with examples from communications, control, and signal processing.', fileUrl: 'https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/', year: 2007, categories: ['electrical engineering', 'circuits'] },
  { title: 'Signal Processing', department: 'Electrical Engineering and Computer Science', courseNumber: '6.003', description: 'Fundamentals of signal and system analysis: Fourier series, Fourier transforms, and z-transforms. Applications to communications, control, and audio processing.', fileUrl: 'https://ocw.mit.edu/courses/6-003-signal-processing-spring-2010/', year: 2010, categories: ['signal processing', 'electrical engineering'] },
  // MATHEMATICS
  { title: 'Single Variable Calculus', department: 'Mathematics', courseNumber: '18.01', description: 'Derivatives and integrals of functions of one variable. Integration techniques, applications to geometry and physics, introduction to differential equations and infinite series.', fileUrl: 'https://ocw.mit.edu/courses/18-01-single-variable-calculus-fall-2006/', year: 2006, categories: ['calculus', 'mathematics'] },
  { title: 'Multivariable Calculus', department: 'Mathematics', courseNumber: '18.02', description: 'Calculus of functions of several variables: vectors and matrices, partial derivatives, double and triple integrals, and theorems of Green, Gauss, and Stokes.', fileUrl: 'https://ocw.mit.edu/courses/18-02-multivariable-calculus-fall-2007/', year: 2007, categories: ['calculus', 'mathematics'] },
  { title: 'Differential Equations', department: 'Mathematics', courseNumber: '18.03', description: 'Differential equations and their applications: first order equations, linear equations with constant coefficients, Laplace transform, series solutions, and systems of ODEs.', fileUrl: 'https://ocw.mit.edu/courses/18-03-differential-equations-spring-2010/', year: 2010, categories: ['differential equations', 'mathematics'] },
  { title: 'Linear Algebra', department: 'Mathematics', courseNumber: '18.06', description: 'Matrix theory and linear algebra: vector spaces, matrices, solving linear equations, orthogonality, determinants, eigenvalues, and positive definite matrices.', fileUrl: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/', year: 2010, categories: ['linear algebra', 'mathematics'] },
  { title: 'Introduction to Analysis', department: 'Mathematics', courseNumber: '18.100A', description: 'Mathematical analysis of functions of one variable: sequences, limits, continuity, derivatives, Riemann integral, power series, and uniform convergence.', fileUrl: 'https://ocw.mit.edu/courses/18-100a-introduction-to-analysis-fall-2012/', year: 2012, categories: ['real analysis', 'mathematics'] },
  { title: 'Theory of Computation', department: 'Mathematics', courseNumber: '18.404J', description: 'Mathematical introduction to computing: finite automata, regular languages, context-free languages, computability, decidability, and NP-completeness.', fileUrl: 'https://ocw.mit.edu/courses/18-404j-theory-of-computation-fall-2020/', year: 2020, categories: ['theory of computation', 'mathematics'] },
  { title: 'Statistics for Applications', department: 'Mathematics', courseNumber: '18.650', description: 'Statistical methods and their applications: parameter estimation, hypothesis testing, regression analysis, and Bayesian statistics with practical data analysis.', fileUrl: 'https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/', year: 2016, categories: ['statistics', 'mathematics'] },
  { title: 'Theory of Numbers', department: 'Mathematics', courseNumber: '18.781', description: 'Elementary number theory: divisibility, congruences, the Chinese Remainder Theorem, quadratic residues, Dirichlet series, and analytic methods.', fileUrl: 'https://ocw.mit.edu/courses/18-781-theory-of-numbers-spring-2012/', year: 2012, categories: ['number theory', 'mathematics'] },
  { title: 'Abstract Algebra I', department: 'Mathematics', courseNumber: '18.701', description: 'Groups, subgroups, homomorphisms, Sylow theorems, rings, and fields. Applications to geometric problems and Galois theory.', fileUrl: 'https://ocw.mit.edu/courses/18-701-algebra-i-fall-2010/', year: 2010, categories: ['algebra', 'mathematics'] },
  { title: 'Probability and Random Variables', department: 'Mathematics', courseNumber: '18.600', description: 'Probability spaces, random variables, distributions, and expectation. Discrete and continuous distributions, limit theorems, Markov chains, and random processes.', fileUrl: 'https://ocw.mit.edu/courses/18-600-probability-and-random-variables-fall-2019/', year: 2019, categories: ['probability', 'mathematics'] },
  { title: 'Introduction to Topology', department: 'Mathematics', courseNumber: '18.901', description: 'Topological spaces, continuous maps, connectedness, compactness, metric spaces, quotient spaces, and the fundamental group.', fileUrl: 'https://ocw.mit.edu/courses/18-901-introduction-to-topology-fall-2004/', year: 2004, categories: ['topology', 'mathematics'] },
  // PHYSICS
  { title: 'Classical Mechanics', department: 'Physics', courseNumber: '8.01', description: 'Introduction to classical mechanics: space, time, and Newton\'s laws. Work and energy conservation, rotation, angular momentum, oscillations, and gravitation.', fileUrl: 'https://ocw.mit.edu/courses/8-01-classical-mechanics-fall-2016/', year: 2016, categories: ['mechanics', 'physics'] },
  { title: 'Electricity and Magnetism', department: 'Physics', courseNumber: '8.02', description: 'Foundations of electromagnetism: electrostatics, magnetism, electromagnetic induction, Maxwell\'s equations, and electromagnetic waves.', fileUrl: 'https://ocw.mit.edu/courses/8-02-physics-ii-electricity-and-magnetism-spring-2019/', year: 2019, categories: ['electromagnetism', 'physics'] },
  { title: 'Vibrations and Waves', department: 'Physics', courseNumber: '8.03SC', description: 'Mechanical vibrations and waves: simple harmonic motion, superposition, forced vibrations, resonance, coupled oscillations, normal modes, and electromagnetic waves.', fileUrl: 'https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/', year: 2016, categories: ['waves', 'physics'] },
  { title: 'Quantum Physics I', department: 'Physics', courseNumber: '8.04', description: 'Introduction to quantum mechanics: wave mechanics, the Schrödinger equation, one-dimensional potentials, the harmonic oscillator, operators, states, and spin.', fileUrl: 'https://ocw.mit.edu/courses/8-04-quantum-physics-i-spring-2016/', year: 2016, categories: ['quantum mechanics', 'physics'] },
  { title: 'Quantum Physics II', department: 'Physics', courseNumber: '8.05', description: 'Continuation of Quantum Physics I covering the hydrogen atom, perturbation theory, identical particles, variational methods, and time-dependent perturbation theory.', fileUrl: 'https://ocw.mit.edu/courses/8-05-quantum-physics-ii-fall-2013/', year: 2013, categories: ['quantum mechanics', 'physics'] },
  { title: 'Quantum Physics III', department: 'Physics', courseNumber: '8.06', description: 'Advanced quantum mechanics: scattering theory, relativistic quantum mechanics, and applications to atomic, nuclear, and particle physics.', fileUrl: 'https://ocw.mit.edu/courses/8-06-quantum-physics-iii-spring-2018/', year: 2018, categories: ['quantum mechanics', 'physics'] },
  { title: 'Introduction to Special Relativity', department: 'Physics', courseNumber: '8.20', description: 'Foundations of special relativity: Lorentz transformations, relativistic mechanics, electrodynamics, and the equivalence of mass and energy.', fileUrl: 'https://ocw.mit.edu/courses/8-20-introduction-to-special-relativity-january-iap-2005/', year: 2005, categories: ['relativity', 'physics'] },
  { title: 'The Early Universe', department: 'Physics', courseNumber: '8.286', description: 'Introduction to modern cosmology: the Big Bang model, inflation, dark matter, dark energy, and the cosmic microwave background radiation.', fileUrl: 'https://ocw.mit.edu/courses/8-286-the-early-universe-fall-2013/', year: 2013, categories: ['cosmology', 'physics'] },
  { title: 'Statistical Physics I', department: 'Physics', courseNumber: '8.08', description: 'Thermodynamics, statistical mechanics, and information theory. Covers entropy, free energy, partition functions, quantum statistical mechanics, and phase transitions.', fileUrl: 'https://ocw.mit.edu/courses/8-08-statistical-physics-ii-spring-2005/', year: 2005, categories: ['statistical mechanics', 'physics'] },
  { title: 'Atomic and Optical Physics', department: 'Physics', courseNumber: '8.421', description: 'Advanced quantum optics: laser physics, coherent control of atomic systems, optical trapping, and Bose-Einstein condensation.', fileUrl: 'https://ocw.mit.edu/courses/8-421-atomic-and-optical-physics-i-spring-2014/', year: 2014, categories: ['quantum optics', 'physics'] },
  // BIOLOGY
  { title: 'Introductory Biology', department: 'Biology', courseNumber: '7.012', description: 'Introduction to biological sciences covering biochemistry, genetics, molecular biology, cell biology, developmental biology, and evolutionary biology.', fileUrl: 'https://ocw.mit.edu/courses/7-012-introductory-biology-fall-2004/', year: 2004, categories: ['biology', 'molecular biology'] },
  { title: 'Genetics', department: 'Biology', courseNumber: '7.03', description: 'Principles of genetics: Mendelian genetics, chromosomal theory of heredity, gene mapping, molecular genetics, and population genetics.', fileUrl: 'https://ocw.mit.edu/courses/7-03-genetics-fall-2004/', year: 2004, categories: ['genetics', 'biology'] },
  { title: 'Cell Biology', department: 'Biology', courseNumber: '7.06', description: 'Cell structure and function: membranes, cytoskeleton, signal transduction, cell cycle, mitosis, meiosis, and programmed cell death.', fileUrl: 'https://ocw.mit.edu/courses/7-06-cell-biology-spring-2007/', year: 2007, categories: ['cell biology', 'biology'] },
  { title: 'Molecular Biology', department: 'Biology', courseNumber: '7.28', description: 'Molecular mechanisms of DNA replication, transcription, and translation. Gene regulation, recombinant DNA technology, and genomics.', fileUrl: 'https://ocw.mit.edu/courses/7-28-molecular-biology-spring-2005/', year: 2005, categories: ['molecular biology', 'biology'] },
  { title: 'Computational and Systems Biology', department: 'Biology', courseNumber: '7.91J', description: 'Computational methods in biology: sequence analysis, structural bioinformatics, network models, and systems biology approaches.', fileUrl: 'https://ocw.mit.edu/courses/7-91j-foundations-of-computational-and-systems-biology-spring-2014/', year: 2014, categories: ['computational biology', 'data science'] },
  { title: 'Neuroscience and Behavior', department: 'Biology', courseNumber: '7.29J', description: 'Neuroscience basis of behavior: cellular and molecular neuroscience, neural circuits, sensory and motor systems, and cognitive neuroscience.', fileUrl: 'https://ocw.mit.edu/courses/7-29j-cellular-neuroscience-spring-2015/', year: 2015, categories: ['neuroscience', 'biology'] },
  { title: 'Biochemistry', department: 'Biology', courseNumber: '7.08J', description: 'Chemical basis of life: protein structure and function, enzyme kinetics, metabolic pathways, and biosynthetic mechanisms.', fileUrl: 'https://ocw.mit.edu/courses/7-08j-biological-chemistry-ii-spring-2016/', year: 2016, categories: ['biochemistry', 'chemistry'] },
  { title: 'Evolutionary Biology', department: 'Biology', courseNumber: '7.25', description: 'Principles of evolutionary biology: natural selection, genetic drift, speciation, phylogenetics, and macroevolution.', fileUrl: 'https://ocw.mit.edu/courses/7-25-evolutionary-biology-fall-2014/', year: 2014, categories: ['evolutionary biology', 'biology'] },
  // CHEMISTRY
  { title: 'Principles of Chemical Science', department: 'Chemistry', courseNumber: '5.111', description: 'Introduction to chemistry: atomic and molecular electronic structure, thermodynamics, acid-base and redox equilibria, chemical kinetics, and catalysis.', fileUrl: 'https://ocw.mit.edu/courses/5-111sc-principles-of-chemical-science-fall-2014/', year: 2014, categories: ['chemistry', 'chemical science'] },
  { title: 'Thermodynamics and Kinetics', department: 'Chemistry', courseNumber: '5.60', description: 'Laws of thermodynamics, thermochemistry, free energy, phase equilibria, and chemical equilibria. Chemical kinetics: rate laws, reaction mechanisms, and catalysis.', fileUrl: 'https://ocw.mit.edu/courses/5-60-thermodynamics-and-kinetics-spring-2008/', year: 2008, categories: ['thermodynamics', 'chemistry'] },
  { title: 'Biological Chemistry I', department: 'Chemistry', courseNumber: '5.07J', description: 'Biological chemistry at the molecular level: protein structure, enzyme mechanisms, metabolic pathways, and biosignaling.', fileUrl: 'https://ocw.mit.edu/courses/5-07j-biological-chemistry-i-fall-2013/', year: 2013, categories: ['biochemistry', 'chemistry'] },
  { title: 'Organic Chemistry I', department: 'Chemistry', courseNumber: '5.12', description: 'Structure, bonding, and mechanisms in organic chemistry: substitution and elimination reactions, stereochemistry, and introduction to carbonyl chemistry.', fileUrl: 'https://ocw.mit.edu/courses/5-12-organic-chemistry-i-spring-2003/', year: 2003, categories: ['organic chemistry', 'chemistry'] },
  { title: 'Organic Chemistry II', department: 'Chemistry', courseNumber: '5.13', description: 'Reactions of carbonyl compounds, aromatic chemistry, pericyclic reactions, and introduction to natural product synthesis.', fileUrl: 'https://ocw.mit.edu/courses/5-13-organic-chemistry-ii-fall-2003/', year: 2003, categories: ['organic chemistry', 'chemistry'] },
  { title: 'Physical Chemistry', department: 'Chemistry', courseNumber: '5.61', description: 'Quantum mechanical foundations of chemistry: particle in a box, hydrogen atom, many-electron atoms, chemical bonding, spectroscopy, and statistical mechanics.', fileUrl: 'https://ocw.mit.edu/courses/5-61-physical-chemistry-fall-2013/', year: 2013, categories: ['physical chemistry', 'chemistry'] },
  // ECONOMICS
  { title: 'Principles of Microeconomics', department: 'Economics', courseNumber: '14.01', description: 'Introduction to microeconomics: consumer theory, producer theory, market equilibrium, market failures, and public policy applications.', fileUrl: 'https://ocw.mit.edu/courses/14-01sc-principles-of-microeconomics-fall-2011/', year: 2011, categories: ['microeconomics', 'economics'] },
  { title: 'Principles of Macroeconomics', department: 'Economics', courseNumber: '14.02', description: 'Introduction to macroeconomics: national income accounting, business cycles, money and banking, and fiscal and monetary policy.', fileUrl: 'https://ocw.mit.edu/courses/14-02-principles-of-macroeconomics-spring-2014/', year: 2014, categories: ['macroeconomics', 'economics'] },
  { title: 'Economic Applications of Game Theory', department: 'Economics', courseNumber: '14.12', description: 'Game theory and its applications in economics: normal form games, Nash equilibrium, extensive form games, repeated games, and mechanism design.', fileUrl: 'https://ocw.mit.edu/courses/14-12-economic-applications-of-game-theory-fall-2012/', year: 2012, categories: ['game theory', 'economics'] },
  { title: 'International Trade', department: 'Economics', courseNumber: '14.54', description: 'Theory and evidence on international trade: comparative advantage, trade policy, multinational firms, and the impact of globalization on wages and welfare.', fileUrl: 'https://ocw.mit.edu/courses/14-54-international-trade-fall-2016/', year: 2016, categories: ['economics', 'international economics'] },
  { title: 'The Challenge of World Poverty', department: 'Economics', courseNumber: '14.73', description: 'Randomized controlled trials applied to development economics. Topics include education, health, microfinance, and anti-poverty programs in developing countries.', fileUrl: 'https://ocw.mit.edu/courses/14-73-the-challenge-of-world-poverty-spring-2011/', year: 2011, categories: ['development economics', 'economics'] },
  { title: 'Public Finance and Public Policy', department: 'Economics', courseNumber: '14.41', description: 'Government role in the economy: social insurance, taxation, healthcare, education, and retirement policy. Empirical methods in public finance.', fileUrl: 'https://ocw.mit.edu/courses/14-41-public-finance-and-public-policy-fall-2010/', year: 2010, categories: ['public policy', 'economics'] },
  { title: 'Labor Economics', department: 'Economics', courseNumber: '14.64', description: 'Labor markets: labor supply, labor demand, human capital theory, wage inequality, unemployment, and effects of immigration and trade on labor markets.', fileUrl: 'https://ocw.mit.edu/courses/14-64-labor-economics-and-public-policy-fall-2009/', year: 2009, categories: ['labor economics', 'economics'] },
  { title: 'Introduction to Econometrics', department: 'Economics', courseNumber: '14.32', description: 'Statistical methods for economics: regression analysis, instrumental variables, difference-in-differences, regression discontinuity, and panel data methods.', fileUrl: 'https://ocw.mit.edu/courses/14-32-econometrics-spring-2007/', year: 2007, categories: ['econometrics', 'statistics'] },
  { title: 'Health Economics', department: 'Economics', courseNumber: '14.43', description: 'Economic analysis of health care markets: health insurance, provider behavior, pharmaceutical markets, and health policy evaluation.', fileUrl: 'https://ocw.mit.edu/courses/14-43-the-economics-of-health-care-spring-2007/', year: 2007, categories: ['health economics', 'economics'] },
  // MECHANICAL ENGINEERING
  { title: 'Dynamics and Control I', department: 'Mechanical Engineering', courseNumber: '2.003', description: 'Introduction to dynamics: particle and rigid body dynamics, energy methods, vibrations, and an introduction to feedback control systems.', fileUrl: 'https://ocw.mit.edu/courses/2-003-modeling-dynamics-and-control-i-spring-2005/', year: 2005, categories: ['mechanical engineering', 'dynamics'] },
  { title: 'Dynamics and Control II', department: 'Mechanical Engineering', courseNumber: '2.004', description: 'Advanced dynamics and control: linear system theory, root locus, Bode plots, state-space methods, and introduction to digital control.', fileUrl: 'https://ocw.mit.edu/courses/2-004-dynamics-and-control-ii-spring-2008/', year: 2008, categories: ['mechanical engineering', 'control systems'] },
  { title: 'Numerical Computation for Mechanical Engineers', department: 'Mechanical Engineering', courseNumber: '2.086', description: 'Numerical methods for engineering problems: root finding, interpolation, numerical integration, ODEs, linear algebra, and optimization algorithms.', fileUrl: 'https://ocw.mit.edu/courses/2-086-numerical-computation-for-mechanical-engineers-fall-2014/', year: 2014, categories: ['numerical methods', 'engineering'] },
  { title: 'Thermal-Fluids Engineering', department: 'Mechanical Engineering', courseNumber: '2.006', description: 'Intermediate thermodynamics and fluid mechanics: heat transfer modes, mass transfer, and applications to engineering systems design.', fileUrl: 'https://ocw.mit.edu/courses/2-006-thermal-fluids-engineering-ii-spring-2008/', year: 2008, categories: ['thermodynamics', 'mechanical engineering'] },
  { title: 'Solid Mechanics', department: 'Mechanical Engineering', courseNumber: '2.001', description: 'Statics and mechanics of materials: stress, strain, deformation of engineering structures. Torsion, bending, and column buckling.', fileUrl: 'https://ocw.mit.edu/courses/2-001-mechanics-and-materials-i-fall-2006/', year: 2006, categories: ['mechanics', 'mechanical engineering'] },
  { title: 'Marine Hydrodynamics', department: 'Mechanical Engineering', courseNumber: '2.20', description: 'Ideal flow theory, viscous boundary layers, wave motions, ship resistance, and propulsion in marine and offshore engineering contexts.', fileUrl: 'https://ocw.mit.edu/courses/2-20-marine-hydrodynamics-13-021-spring-2005/', year: 2005, categories: ['fluid mechanics', 'engineering'] },
  // BRAIN AND COGNITIVE SCIENCES
  { title: 'Introduction to Psychology', department: 'Brain and Cognitive Sciences', courseNumber: '9.00SC', description: 'Scientific study of psychology: cognitive psychology, social psychology, developmental psychology, clinical psychology, and their neuroscientific foundations.', fileUrl: 'https://ocw.mit.edu/courses/9-00sc-introduction-to-psychology-fall-2011/', year: 2011, categories: ['psychology', 'neuroscience'] },
  { title: 'The Human Brain', department: 'Brain and Cognitive Sciences', courseNumber: '9.11', description: 'Overview of human brain structure and function: neuroanatomy, sensory systems, motor systems, association areas, memory, and higher cognition.', fileUrl: 'https://ocw.mit.edu/courses/9-11-the-human-brain-spring-2017/', year: 2017, categories: ['neuroscience', 'cognitive science'] },
  { title: 'Introduction to Neural Computation', department: 'Brain and Cognitive Sciences', courseNumber: '9.40', description: 'Computational models of neural systems: Hopfield networks, Boltzmann machines, recurrent networks, and reinforcement learning in biological systems.', fileUrl: 'https://ocw.mit.edu/courses/9-40-introduction-to-neural-computation-spring-2018/', year: 2018, categories: ['neural computation', 'neuroscience'] },
  { title: 'Computational Cognitive Science', department: 'Brain and Cognitive Sciences', courseNumber: '9.66J', description: 'Probabilistic models of cognition: Bayesian models, causal reasoning, concept learning, language acquisition, and intuitive physics.', fileUrl: 'https://ocw.mit.edu/courses/9-66j-computational-cognitive-science-fall-2004/', year: 2004, categories: ['cognitive science', 'neuroscience'] },
  { title: 'Social Psychology', department: 'Brain and Cognitive Sciences', courseNumber: '9.75', description: 'Scientific study of social behavior: social cognition, attitudes, conformity, persuasion, group dynamics, and intergroup relations.', fileUrl: 'https://ocw.mit.edu/courses/9-75-social-psychology-spring-2016/', year: 2016, categories: ['psychology', 'cognitive science'] },
  { title: 'Memory and Cognition', department: 'Brain and Cognitive Sciences', courseNumber: '9.65', description: 'Cognitive neuroscience of memory: working memory, long-term memory, semantic and episodic memory, and the role of the hippocampus.', fileUrl: 'https://ocw.mit.edu/courses/9-65-cognitive-processes-spring-2004/', year: 2004, categories: ['cognitive neuroscience', 'neuroscience'] },
  // ARCHITECTURE
  { title: 'Geometric Disciplines and Architecture Skills', department: 'Architecture', courseNumber: '4.105', description: 'Geometric thinking in architecture: drawing, modeling, and the relationship between form, space, and geometry in architectural design.', fileUrl: 'https://ocw.mit.edu/courses/4-105-geometric-disciplines-and-architecture-skills-geometric-disciplines-fall-2012/', year: 2012, categories: ['architecture', 'design'] },
  { title: 'A Global History of Architecture', department: 'Architecture', courseNumber: '4.605', description: 'World architecture from prehistory to the present: built environments across cultures including Egypt, Greece, Rome, Asia, the Americas, and the modern era.', fileUrl: 'https://ocw.mit.edu/courses/4-605-a-global-history-of-architecture-fall-2011/', year: 2011, categories: ['architecture', 'history'] },
  { title: 'Introduction to Building Technology', department: 'Architecture', courseNumber: '4.401', description: 'Technical aspects of architecture: structural systems, building envelope, mechanical systems, lighting, acoustics, and sustainable design principles.', fileUrl: 'https://ocw.mit.edu/courses/4-401-introduction-to-building-technology-fall-2018/', year: 2018, categories: ['architecture', 'engineering'] },
  { title: 'Environment and Behavior', department: 'Architecture', courseNumber: '4.200', description: 'Relationship between physical environment and human behavior: environmental psychology, place attachment, post-occupancy evaluation, and universal design.', fileUrl: 'https://ocw.mit.edu/courses/4-200-environment-and-behavior-fall-2013/', year: 2013, categories: ['architecture', 'design'] },
  { title: 'Architectural Design Fundamentals', department: 'Architecture', courseNumber: '4.021', description: 'Introduction to the architectural design process: conceptual thinking, spatial composition, representation techniques, and studio critique methods.', fileUrl: 'https://ocw.mit.edu/courses/4-021-design-studio-introduction-to-design-inquiry-spring-2018/', year: 2018, categories: ['architecture', 'design'] },
  // MATERIALS SCIENCE AND ENGINEERING
  { title: 'Fundamentals of Materials Science', department: 'Materials Science and Engineering', courseNumber: '3.012', description: 'Structure and properties of materials: bonding, crystal structures, phase diagrams, diffusion, mechanical behavior, and electrical and optical properties.', fileUrl: 'https://ocw.mit.edu/courses/3-012-fundamentals-of-materials-science-fall-2005/', year: 2005, categories: ['materials science', 'engineering'] },
  { title: 'Introduction to Solid State Chemistry', department: 'Materials Science and Engineering', courseNumber: '3.091', description: 'Chemistry of materials: atomic and molecular structure, thermodynamics, kinetics, phase equilibria, and properties of metals, ceramics, polymers, and semiconductors.', fileUrl: 'https://ocw.mit.edu/courses/3-091-introduction-to-solid-state-chemistry-fall-2018/', year: 2018, categories: ['materials science', 'chemistry'] },
  { title: 'Mechanical Behavior of Materials', department: 'Materials Science and Engineering', courseNumber: '3.032', description: 'Mechanical properties of materials: elasticity, plasticity, fracture, fatigue, and creep. Connection between microstructure and macroscopic mechanical behavior.', fileUrl: 'https://ocw.mit.edu/courses/3-032-mechanical-behavior-of-materials-fall-2007/', year: 2007, categories: ['materials science', 'mechanics'] },
  { title: 'Electronic and Magnetic Properties of Materials', department: 'Materials Science and Engineering', courseNumber: '3.225', description: 'Electronic structure and properties of semiconductors, metals, and insulators. Optical and magnetic properties relevant to device applications.', fileUrl: 'https://ocw.mit.edu/courses/3-225-electronic-optical-and-magnetic-properties-of-materials-fall-2016/', year: 2016, categories: ['materials science', 'physics'] },
  { title: 'Nanoscience and Nanotechnology', department: 'Materials Science and Engineering', courseNumber: '3.052', description: 'Introduction to nanoscience: quantum effects, self-assembly, nanofabrication methods, nanomaterials, and applications in medicine and energy.', fileUrl: 'https://ocw.mit.edu/courses/3-052-nanomechanics-of-materials-and-biomaterials-spring-2007/', year: 2007, categories: ['nanotechnology', 'materials science'] },
  // AERONAUTICS AND ASTRONAUTICS
  { title: 'Principles of Automatic Control', department: 'Aeronautics and Astronautics', courseNumber: '16.06', description: 'Control system design: classical methods, root locus, frequency domain analysis, state-space methods, and digital control with aerospace applications.', fileUrl: 'https://ocw.mit.edu/courses/16-06-principles-of-automatic-control-fall-2012/', year: 2012, categories: ['control systems', 'aerospace engineering'] },
  { title: 'Air Transportation Systems', department: 'Aeronautics and Astronautics', courseNumber: '16.886', description: 'Systems architecting applied to air transportation: stakeholder analysis, requirements, concept generation, and system design for next-generation aviation.', fileUrl: 'https://ocw.mit.edu/courses/16-886-air-transportation-systems-architecting-spring-2004/', year: 2004, categories: ['aerospace engineering', 'systems engineering'] },
  { title: 'Aerodynamics', department: 'Aeronautics and Astronautics', courseNumber: '16.100', description: 'Aerodynamics: potential flow theory, viscous boundary layers, turbulence modeling, and airfoil/wing design for aerospace vehicles.', fileUrl: 'https://ocw.mit.edu/courses/16-100-aerodynamics-fall-2005/', year: 2005, categories: ['aerodynamics', 'aerospace engineering'] },
  { title: 'Structural Mechanics', department: 'Aeronautics and Astronautics', courseNumber: '16.20', description: 'Structural analysis for aerospace vehicles: beams, plates, shells, buckling, aeroelasticity, and composite material structures.', fileUrl: 'https://ocw.mit.edu/courses/16-20-structural-mechanics-fall-2002/', year: 2002, categories: ['structural mechanics', 'aerospace engineering'] },
  { title: 'Spacecraft Dynamics', department: 'Aeronautics and Astronautics', courseNumber: '16.07', description: 'Newtonian and Lagrangian mechanics applied to spacecraft: rigid body dynamics, orbital mechanics, attitude dynamics, and trajectory optimization.', fileUrl: 'https://ocw.mit.edu/courses/16-07-dynamics-fall-2009/', year: 2009, categories: ['dynamics', 'aerospace engineering'] },
  // POLITICAL SCIENCE
  { title: 'Introduction to American Politics', department: 'Political Science', courseNumber: '17.20', description: 'American political institutions: Congress, the Presidency, and the courts. Political behavior, parties, elections, public opinion, and interest groups.', fileUrl: 'https://ocw.mit.edu/courses/17-20-introduction-to-american-politics-fall-2004/', year: 2004, categories: ['political science', 'american politics'] },
  { title: 'The Causes and Prevention of War', department: 'Political Science', courseNumber: '17.42', description: 'Causes of international conflict: deterrence, alliance politics, nationalism, ethnic conflict, and civil wars. Strategies for conflict prevention and resolution.', fileUrl: 'https://ocw.mit.edu/courses/17-42-the-causes-and-prevention-of-war-spring-2009/', year: 2009, categories: ['political science', 'international relations'] },
  { title: 'Introduction to Comparative Politics', department: 'Political Science', courseNumber: '17.50', description: 'Comparing political systems, regimes, and institutions across countries. Topics include democracy, authoritarianism, revolutions, and political economy.', fileUrl: 'https://ocw.mit.edu/courses/17-50-introduction-to-comparative-politics-fall-2014/', year: 2014, categories: ['political science', 'comparative politics'] },
  { title: 'International Relations', department: 'Political Science', courseNumber: '17.40', description: 'Theories of international politics: realism, liberalism, and constructivism. Topics include alliances, international institutions, and global governance.', fileUrl: 'https://ocw.mit.edu/courses/17-40-american-foreign-policy-past-present-future-fall-2017/', year: 2017, categories: ['international relations', 'political science'] },
  { title: 'Introduction to Political Thought', department: 'Political Science', courseNumber: '17.02', description: 'Classical and contemporary theories of democracy and the state: ancient Greece, social contract theories, deliberative democracy, and participatory democracy.', fileUrl: 'https://ocw.mit.edu/courses/17-02-introduction-to-political-thought-fall-2013/', year: 2013, categories: ['political theory', 'political science'] },
  // HISTORY
  { title: 'How to Stage a Revolution', department: 'History', courseNumber: '21H.001', description: 'Comparative study of modern revolutions: the American, French, Russian, Chinese, and Cuban revolutions. Causes, processes, and long-term outcomes.', fileUrl: 'https://ocw.mit.edu/courses/21h-001-how-to-stage-a-revolution-fall-2012/', year: 2012, categories: ['history', 'political science'] },
  { title: 'American History Since 1865', department: 'History', courseNumber: '21H.102', description: 'American history from Reconstruction to the present: industrialization, the Progressive Era, World Wars, Civil Rights movement, and contemporary transformations.', fileUrl: 'https://ocw.mit.edu/courses/21h-102-american-history-since-1865-spring-2015/', year: 2015, categories: ['history', 'american history'] },
  { title: 'Ancient Greece', department: 'History', courseNumber: '21H.302', description: 'Political, social, and cultural history of ancient Greece from the Bronze Age through the Hellenistic period. Democracy, philosophy, and warfare.', fileUrl: 'https://ocw.mit.edu/courses/21h-302-ancient-greece-spring-2016/', year: 2016, categories: ['history', 'ancient history'] },
  { title: 'Technology and Culture', department: 'History', courseNumber: '21H.383', description: 'History of American science and technology: industrialization, the research university, Cold War science, computing, and the digital revolution.', fileUrl: 'https://ocw.mit.edu/courses/21h-383-technology-and-culture-fall-2016/', year: 2016, categories: ['history', 'science and technology'] },
  { title: 'Modern Japan', department: 'History', courseNumber: '21H.153', description: 'History of modern Japan from the Meiji Restoration to the present: industrialization, imperialism, WWII, American occupation, and economic development.', fileUrl: 'https://ocw.mit.edu/courses/21h-153-modern-japan-fall-2018/', year: 2018, categories: ['history', 'asian studies'] },
  // LINGUISTICS AND PHILOSOPHY
  { title: 'Problems of Philosophy', department: 'Linguistics and Philosophy', courseNumber: '24.00', description: 'Introduction to philosophical problems: knowledge and skepticism, the nature of mind, personal identity, free will, and the foundations of ethics.', fileUrl: 'https://ocw.mit.edu/courses/24-00-problems-of-philosophy-spring-2015/', year: 2015, categories: ['philosophy', 'epistemology'] },
  { title: 'Minds and Machines', department: 'Linguistics and Philosophy', courseNumber: '24.09', description: 'Philosophy of artificial intelligence and cognitive science: the nature of mind, consciousness, the Chinese Room argument, and prospects for machine intelligence.', fileUrl: 'https://ocw.mit.edu/courses/24-09-minds-and-machines-fall-2011/', year: 2011, categories: ['philosophy', 'cognitive science'] },
  { title: 'Philosophy of Language', department: 'Linguistics and Philosophy', courseNumber: '24.251', description: 'Meaning, reference, truth, and the relationship between language and thought. Covers Frege, Russell, Kripke, and contemporary semantic theories.', fileUrl: 'https://ocw.mit.edu/courses/24-251-introduction-to-philosophy-of-language-fall-2011/', year: 2011, categories: ['philosophy', 'linguistics'] },
  { title: 'Ethics', department: 'Linguistics and Philosophy', courseNumber: '24.231', description: 'Major ethical theories: consequentialism, deontology, virtue ethics, and contractualism. Applications to bioethics, political philosophy, and global justice.', fileUrl: 'https://ocw.mit.edu/courses/24-231-ethics-fall-2009/', year: 2009, categories: ['ethics', 'philosophy'] },
  { title: 'Introduction to Linguistics', department: 'Linguistics and Philosophy', courseNumber: '24.900', description: 'Scientific study of human language: phonology, morphology, syntax, semantics, and pragmatics. Language acquisition, change, and linguistic diversity.', fileUrl: 'https://ocw.mit.edu/courses/24-900-introduction-to-linguistics-fall-2012/', year: 2012, categories: ['linguistics', 'cognitive science'] },
  // WRITING
  { title: 'Writing and Reading Essays', department: 'Writing', courseNumber: '21W.022', description: 'Development of academic writing: essay structure, argumentation, research methods, and revision. Students read and analyze essays across genres and disciplines.', fileUrl: 'https://ocw.mit.edu/courses/21w-022-writing-and-reading-essays-fall-2004/', year: 2004, categories: ['writing', 'literature'] },
  { title: 'Science Writing', department: 'Writing', courseNumber: '21W.035', description: 'Writing about science for general audiences: news articles, essays, and feature writing on scientific topics for non-specialist readers.', fileUrl: 'https://ocw.mit.edu/courses/21w-035-science-writing-spring-2016/', year: 2016, categories: ['writing', 'science communication'] },
  { title: 'Technical Writing', department: 'Writing', courseNumber: '21W.732', description: 'Writing in professional contexts: technical reports, proposals, documentation, and presentations for engineering and scientific audiences.', fileUrl: 'https://ocw.mit.edu/courses/21w-732-introduction-to-technical-communication-fall-2010/', year: 2010, categories: ['writing', 'technical communication'] },
  // SLOAN SCHOOL OF MANAGEMENT
  { title: 'Economic Analysis for Business Decisions', department: 'Sloan School of Management', courseNumber: '15.010', description: 'Microeconomic tools for business decision-making: supply and demand analysis, pricing strategies, game theory, and market structure analysis.', fileUrl: 'https://ocw.mit.edu/courses/15-010-economic-analysis-for-business-decisions-fall-2004/', year: 2004, categories: ['business', 'economics'] },
  { title: 'Finance Theory I', department: 'Sloan School of Management', courseNumber: '15.401', description: 'Foundations of finance: time value of money, portfolio theory, CAPM, options pricing, and corporate finance fundamentals.', fileUrl: 'https://ocw.mit.edu/courses/15-401-finance-theory-i-fall-2008/', year: 2008, categories: ['finance', 'business'] },
  { title: 'Organizational Economics', department: 'Sloan School of Management', courseNumber: '15.340', description: 'Economic analysis of organizational design: incentive contracts, hierarchy, information asymmetries, and the boundaries of the firm.', fileUrl: 'https://ocw.mit.edu/courses/15-340-analyzing-organizations-fall-2006/', year: 2006, categories: ['organizational economics', 'business'] },
  { title: 'Strategic Management', department: 'Sloan School of Management', courseNumber: '15.902', description: 'Frameworks for strategic analysis: competitive advantage, industry structure, innovation strategy, and corporate strategy formulation and execution.', fileUrl: 'https://ocw.mit.edu/courses/15-902-strategic-management-i-fall-2006/', year: 2006, categories: ['business', 'strategy'] },
  { title: 'New Enterprises', department: 'Sloan School of Management', courseNumber: '15.390', description: 'Entrepreneurship fundamentals: opportunity recognition, business model design, customer development, and startup financing strategies.', fileUrl: 'https://ocw.mit.edu/courses/15-390-new-enterprises-spring-2013/', year: 2013, categories: ['entrepreneurship', 'business'] },
  // CHEMICAL ENGINEERING
  { title: 'Heat and Mass Transfer', department: 'Chemical Engineering', courseNumber: '10.302', description: 'Fundamentals of heat and mass transfer: conduction, convection, radiation, and simultaneous transfer applied to chemical engineering systems.', fileUrl: 'https://ocw.mit.edu/courses/10-302-introduction-to-heat-and-mass-transfer-fall-2007/', year: 2007, categories: ['chemical engineering', 'thermodynamics'] },
  { title: 'Chemical and Biological Reaction Engineering', department: 'Chemical Engineering', courseNumber: '10.37', description: 'Rate laws, stoichiometry, and design equations for chemical reactors: batch, CSTR, plug flow, and bioreactor systems.', fileUrl: 'https://ocw.mit.edu/courses/10-37-chemical-and-biological-reaction-engineering-spring-2007/', year: 2007, categories: ['chemical engineering', 'chemistry'] },
  { title: 'Separation Processes', department: 'Chemical Engineering', courseNumber: '10.445', description: 'Separation science and engineering: distillation, extraction, absorption, chromatography, and membrane separation processes.', fileUrl: 'https://ocw.mit.edu/courses/10-445-separation-processes-for-biochemical-products-summer-2005/', year: 2005, categories: ['chemical engineering', 'process engineering'] },
  // NUCLEAR SCIENCE AND ENGINEERING
  { title: 'Introduction to Ionizing Radiation', department: 'Nuclear Science and Engineering', courseNumber: '22.01', description: 'Fundamentals of ionizing radiation: radioactive decay, interaction with matter, radiation detection, dosimetry, and radiation protection principles.', fileUrl: 'https://ocw.mit.edu/courses/22-01-introduction-to-ionizing-radiation-fall-2016/', year: 2016, categories: ['nuclear engineering', 'physics'] },
  { title: 'Introduction to Applied Nuclear Physics', department: 'Nuclear Science and Engineering', courseNumber: '22.02', description: 'Nuclear physics fundamentals: nuclear structure, radioactivity, nuclear reactions, fission cross sections, and fusion energy.', fileUrl: 'https://ocw.mit.edu/courses/22-02-introduction-to-applied-nuclear-physics-spring-2012/', year: 2012, categories: ['nuclear physics', 'physics'] },
  { title: 'Nuclear Systems Design Project', department: 'Nuclear Science and Engineering', courseNumber: '22.033', description: 'Capstone design project for nuclear systems: reactor design, safety analysis, fuel management, environmental impact, and economic analysis.', fileUrl: 'https://ocw.mit.edu/courses/22-033-nuclear-systems-design-project-fall-2011/', year: 2011, categories: ['nuclear engineering', 'engineering'] },
  // EARTH, ATMOSPHERIC, AND PLANETARY SCIENCES
  { title: 'Introduction to Geology', department: 'Earth, Atmospheric, and Planetary Sciences', courseNumber: '12.001', description: 'Geologic processes: plate tectonics, earthquakes, volcanoes, erosion, and the geologic record. Reading and interpreting geologic maps and landforms.', fileUrl: 'https://ocw.mit.edu/courses/12-001-introduction-to-geology-fall-2013/', year: 2013, categories: ['geology', 'earth science'] },
  { title: 'Physics and Chemistry of Earth Materials', department: 'Earth, Atmospheric, and Planetary Sciences', courseNumber: '12.002', description: 'Mineralogy, petrology, and crystal chemistry: crystal structures, mineral physics, and the composition and dynamics of Earth\'s interior.', fileUrl: 'https://ocw.mit.edu/courses/12-002-physics-and-chemistry-of-earth-materials-fall-2005/', year: 2005, categories: ['geology', 'mineralogy'] },
  { title: 'Introduction to Physical Oceanography', department: 'Earth, Atmospheric, and Planetary Sciences', courseNumber: '12.080', description: 'Ocean circulation: thermohaline circulation, wind-driven gyres, tides, ocean-atmosphere interaction, and the role of the ocean in climate.', fileUrl: 'https://ocw.mit.edu/courses/12-080-introduction-to-physical-oceanography-fall-2006/', year: 2006, categories: ['oceanography', 'earth science'] },
  { title: 'Atmospheric Dynamics', department: 'Earth, Atmospheric, and Planetary Sciences', courseNumber: '12.800', description: 'Atmospheric motions: governing equations, rotating flows, large-scale circulation, weather systems, and turbulence in the atmosphere and ocean.', fileUrl: 'https://ocw.mit.edu/courses/12-800-fluid-dynamics-of-the-atmosphere-and-ocean-fall-2004/', year: 2004, categories: ['meteorology', 'earth science'] },
  // COMPARATIVE MEDIA STUDIES
  { title: 'Introduction to Videogame Studies', department: 'Comparative Media Studies', courseNumber: 'CMS.300', description: 'Critical analysis of video games: game design, narrative structure, representation, the games industry, and the cultural impact of games.', fileUrl: 'https://ocw.mit.edu/courses/cms-300-introduction-to-videogame-studies-fall-2011/', year: 2011, categories: ['media studies', 'game design'] },
  { title: 'Game Design', department: 'Comparative Media Studies', courseNumber: 'CMS.608', description: 'Principles of game design: mechanics, dynamics, aesthetics, player psychology, and the iterative design and playtesting process.', fileUrl: 'https://ocw.mit.edu/courses/cms-608-game-design-fall-2010/', year: 2010, categories: ['game design', 'design'] },
  { title: 'Creating Video Games', department: 'Comparative Media Studies', courseNumber: 'CMS.611J', description: 'Interdisciplinary game development: programming, design, art production, and audio. Students create complete playable game projects from concept to release.', fileUrl: 'https://ocw.mit.edu/courses/cms-611j-creating-video-games-fall-2014/', year: 2014, categories: ['game development', 'programming'] },
  // URBAN STUDIES AND PLANNING
  { title: 'Gateway: Planning Action', department: 'Urban Studies and Planning', courseNumber: '11.201', description: 'Introduction to urban planning: planning history, theory, and contemporary practice. Community engagement, policy analysis, and professional ethics.', fileUrl: 'https://ocw.mit.edu/courses/11-201-gateway-planning-action-fall-2016/', year: 2016, categories: ['urban planning', 'public policy'] },
  { title: 'Spatial Database Management and GIS', department: 'Urban Studies and Planning', courseNumber: '11.521', description: 'Geographic information systems and spatial databases for urban analysis: data models, spatial queries, and GIS applications in city and regional planning.', fileUrl: 'https://ocw.mit.edu/courses/11-521-spatial-database-management-and-advanced-geographic-information-systems-spring-2003/', year: 2003, categories: ['urban planning', 'data science'] },
  { title: 'The City in History', department: 'Urban Studies and Planning', courseNumber: '11.015J', description: 'Historical development of cities from ancient origins to the present: ancient cities, medieval towns, industrial urbanization, and global megacities.', fileUrl: 'https://ocw.mit.edu/courses/11-015j-the-city-in-history-spring-2015/', year: 2015, categories: ['urban planning', 'history'] },
  // SCIENCE, TECHNOLOGY, AND SOCIETY
  { title: 'Technology in American History', department: 'Science, Technology, and Society', courseNumber: 'STS.001', description: 'History of technology and its social impact in America: industrialization, the railroad, electrification, automobile culture, and the internet age.', fileUrl: 'https://ocw.mit.edu/courses/sts-001-technology-in-american-history-spring-2009/', year: 2009, categories: ['science and technology', 'history'] },
  { title: 'Ethics for Engineers', department: 'Science, Technology, and Society', courseNumber: 'STS.360', description: 'Ethical dimensions of engineering practice: professional responsibility, risk communication, public safety, and the social responsibilities of technologists.', fileUrl: 'https://ocw.mit.edu/courses/sts-360-the-history-of-computing-spring-2011/', year: 2011, categories: ['ethics', 'engineering'] },
  // CIVIL AND ENVIRONMENTAL ENGINEERING
  { title: 'Ecology and Engineering for Sustainability', department: 'Civil and Environmental Engineering', courseNumber: '1.020', description: 'Environmental systems analysis: water and air quality, ecosystem services, sustainability metrics, and engineering for environmental protection.', fileUrl: 'https://ocw.mit.edu/courses/1-020-ecology-ii-engineering-for-sustainability-spring-2008/', year: 2008, categories: ['environmental engineering', 'engineering'] },
  { title: 'Fluid Dynamics of the Atmosphere and Ocean', department: 'Civil and Environmental Engineering', courseNumber: '1.058J', description: 'Geophysical fluid dynamics: governing equations, rotating flows, wave motions, and turbulence applied to atmospheric and oceanic systems.', fileUrl: 'https://ocw.mit.edu/courses/1-058j-fluid-dynamics-of-the-atmosphere-and-ocean-fall-2004/', year: 2004, categories: ['fluid dynamics', 'engineering'] },
  { title: 'Transportation Systems Analysis', department: 'Civil and Environmental Engineering', courseNumber: '1.201J', description: 'Transportation systems: demand modeling, network design, operations research, and policy. Covers air, rail, road, and maritime transportation modes.', fileUrl: 'https://ocw.mit.edu/courses/1-201j-transportation-systems-analysis-demand-and-economics-fall-2008/', year: 2008, categories: ['transportation', 'engineering'] },
  // HEALTH SCIENCES AND TECHNOLOGY
  { title: 'Genomics and Computational Biology', department: 'Health Sciences and Technology', courseNumber: 'HST.508', description: 'Computational methods in genomics: sequence alignment, genome assembly, variant calling, gene expression analysis, and computational drug discovery.', fileUrl: 'https://ocw.mit.edu/courses/hst-508-quantitative-genomics-fall-2005/', year: 2005, categories: ['genomics', 'computational biology'] },
  { title: 'Music Perception and Cognition', department: 'Health Sciences and Technology', courseNumber: 'HST.725', description: 'Scientific study of music: auditory perception, emotional responses, music and brain development, and applications to music therapy and rehabilitation.', fileUrl: 'https://ocw.mit.edu/courses/hst-725-music-perception-and-cognition-spring-2009/', year: 2009, categories: ['neuroscience', 'cognitive science'] },
];

// ─── Fake Users ───────────────────────────────────────────────────────────────

const DICEBEAR_STYLES = [
  'adventurer', 'adventurer-neutral', 'avataaars', 'avataaars-neutral',
  'big-ears', 'big-ears-neutral', 'big-smile', 'bottts', 'bottts-neutral',
  'croodles', 'croodles-neutral', 'dylan', 'fun-emoji', 'glass',
  'icons', 'identicon', 'initials', 'lorelei', 'lorelei-neutral',
  'micah', 'miniavs', 'notionists', 'notionists-neutral', 'open-peeps',
  'personas', 'pixel-art', 'pixel-art-neutral', 'rings', 'shapes',
  'thumbs',
];

const SEED_USERS = [
  // prolific archivist — 20 posts, premium badge
  {
    username: 'ocw_archivist', displayName: 'OCW Archivist',
    email: 'archivist@ocwmit.example.com',
    institution: 'Massachusetts Institute of Technology', program: 'OpenCourseWare Initiative',
    plan: 'premium', prolific: true,
  },
  {
    username: 'sarah_chen', displayName: 'Sarah Chen',
    email: 'sarah.chen@example.com',
    institution: 'Tsinghua University', program: 'Computer Science',
    plan: 'pro', prolific: false,
  },
  {
    username: 'alex_kumar', displayName: 'Alex Kumar',
    email: 'alex.kumar@example.com',
    institution: 'University of Mumbai', program: 'Economics',
    plan: 'free', prolific: false,
  },
  {
    username: 'emma_rodriguez', displayName: 'Emma Rodriguez',
    email: 'emma.rodriguez@example.com',
    institution: 'Universidad de Buenos Aires', program: 'Physics',
    plan: 'premium', prolific: false,
  },
  {
    username: 'james_okafor', displayName: 'James Okafor',
    email: 'james.okafor@example.com',
    institution: 'University of Lagos', program: 'Mechanical Engineering',
    plan: 'pro', prolific: false,
  },
  {
    username: 'priya_patel', displayName: 'Priya Patel',
    email: 'priya.patel@example.com',
    institution: 'Indian Institute of Technology Delhi', program: 'Biotechnology',
    plan: 'free', prolific: false,
  },
  {
    username: 'david_mueller', displayName: 'David Mueller',
    email: 'david.mueller@example.com',
    institution: 'ETH Zurich', program: 'Mathematics',
    plan: 'pro', prolific: false,
  },
  {
    username: 'yuki_tanaka', displayName: 'Yuki Tanaka',
    email: 'yuki.tanaka@example.com',
    institution: 'University of Tokyo', program: 'Chemistry',
    plan: 'free', prolific: false,
  },
  {
    username: 'fatima_rashid', displayName: 'Fatima Al-Rashid',
    email: 'fatima.rashid@example.com',
    institution: 'University of Jordan', program: 'Architecture',
    plan: 'pro', prolific: false,
  },
  {
    username: 'chen_wei', displayName: 'Chen Wei',
    email: 'chen.wei@example.com',
    institution: 'University of Zambia', program: 'Materials Science',
    plan: 'free', prolific: false,
  },
  {
    username: 'sofia_petrov', displayName: 'Sofia Petrov',
    email: 'sofia.petrov@example.com',
    institution: 'Lomonosov Moscow State University', program: 'Political Science',
    plan: 'free', prolific: false,
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── arxiv Paper Search ───────────────────────────────────────────────────────
// For each course we search arxiv by title keywords, download the best match,
// and upload it to the private S3 bucket. Each post gets its own unique PDF
// that actually matches its title instead of sharing a per-department fallback.

// Used when no arxiv match is found — one sensible paper per department.
const DEPT_PDF_FALLBACK: Record<string, string> = {
  'Electrical Engineering and Computer Science': 'https://arxiv.org/pdf/1706.03762',
  'Mathematics':                                  'https://arxiv.org/pdf/1911.01464',
  'Physics':                                      'https://arxiv.org/pdf/2212.08013',
  'Biology':                                      'https://arxiv.org/pdf/2303.09472',
  'Chemistry':                                    'https://arxiv.org/pdf/2304.05376',
  'Economics':                                    'https://arxiv.org/pdf/2207.09049',
  'Mechanical Engineering':                       'https://arxiv.org/pdf/2006.11239',
  'Brain and Cognitive Sciences':                 'https://arxiv.org/pdf/2109.01849',
  'Architecture':                                 'https://arxiv.org/pdf/2204.01697',
  'Materials Science and Engineering':            'https://arxiv.org/pdf/2209.11214',
  'Aeronautics and Astronautics':                 'https://arxiv.org/pdf/2006.11239',
  'Political Science':                            'https://arxiv.org/pdf/2207.09049',
  'History':                                      'https://arxiv.org/pdf/1706.03762',
  'Linguistics and Philosophy':                   'https://arxiv.org/pdf/1810.04805',
  'Writing':                                      'https://arxiv.org/pdf/1810.04805',
  'Sloan School of Management':                   'https://arxiv.org/pdf/2207.09049',
  'Chemical Engineering':                         'https://arxiv.org/pdf/2304.05376',
  'Nuclear Science and Engineering':              'https://arxiv.org/pdf/2212.08013',
  'Earth, Atmospheric, and Planetary Sciences':   'https://arxiv.org/pdf/2212.08013',
  'Comparative Media Studies':                    'https://arxiv.org/pdf/1810.04805',
  'Urban Studies and Planning':                   'https://arxiv.org/pdf/2207.09049',
  'Science, Technology, and Society':             'https://arxiv.org/pdf/1706.03762',
  'Civil and Environmental Engineering':          'https://arxiv.org/pdf/2006.11239',
  'Health Sciences and Technology':               'https://arxiv.org/pdf/2303.09472',
};
const LAST_RESORT_PDF = 'https://arxiv.org/pdf/1706.03762';

// arxiv subject category per department for more precise search results.
const ARXIV_CAT_BY_DEPT: Record<string, string> = {
  'Electrical Engineering and Computer Science': 'cs',
  'Mathematics':                                  'math',
  'Physics':                                      'physics',
  'Biology':                                      'q-bio',
  'Chemistry':                                    'physics',
  'Economics':                                    'econ',
  'Mechanical Engineering':                       'physics',
  'Brain and Cognitive Sciences':                 'q-bio',
  'Materials Science and Engineering':            'cond-mat',
  'Aeronautics and Astronautics':                 'physics',
  'Linguistics and Philosophy':                   'cs.CL',
  'Chemical Engineering':                         'physics',
  'Nuclear Science and Engineering':              'nucl-th',
  'Earth, Atmospheric, and Planetary Sciences':   'physics',
  'Science, Technology, and Society':             'cs.CY',
  'Health Sciences and Technology':               'q-bio',
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with',
  'i', 'ii', 'iii', 'iv', 'v',
  'introduction', 'principles', 'fundamentals', 'advanced', 'topics', 'applied',
]);

function titleToSearchTerms(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 5)
    .join(' ');
}

async function searchArxivPdf(courseTitle: string, dept: string): Promise<string | null> {
  const terms = titleToSearchTerms(courseTitle);
  if (!terms) return null;

  const cat = ARXIV_CAT_BY_DEPT[dept] ?? '';
  const catClause = cat ? `+AND+cat:${cat}` : '';
  const q = `ti:${encodeURIComponent(terms)}${catClause}`;
  const url = `https://export.arxiv.org/api/query?search_query=${q}&max_results=1&sortBy=relevance&sortOrder=descending`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'MaterialCrate-Seeder/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const idMatch = xml.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<\s]+)<\/id>/);
  if (!idMatch) return null;

  // strip version suffix (e.g. 1706.03762v7 → 1706.03762)
  return `https://arxiv.org/pdf/${idMatch[1].replace(/v\d+$/, '')}`;
}

// ─── Per-Course S3 PDF Upload ─────────────────────────────────────────────────

async function ensureCoursePdfsOnS3(
  courses: Array<{ title: string; department: string }>,
): Promise<Map<string, string>> {
  const bucket = process.env.AWS_S3_PRIVATE_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    throw new Error('AWS_S3_PRIVATE_BUCKET and AWS_REGION must be set in .env.');
  }

  const result = new Map<string, string>(); // title → s3Url
  console.log(`Ensuring PDFs for ${courses.length} courses...`);

  for (const { title, department } of courses) {
    const slug = sanitizeName(title).slice(0, 80);
    const key = `documents/seed-ocw-${slug}.pdf`;
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
      sourceUrl = await searchArxivPdf(title, department);
    } catch { /* search failed — use fallback */ }

    // 2. Fall back to the department-level paper if arxiv found nothing.
    if (!sourceUrl) sourceUrl = DEPT_PDF_FALLBACK[department] ?? LAST_RESORT_PDF;

    try {
      const res = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'MaterialCrate-Seeder/1.0' },
        signal: AbortSignal.timeout(45000),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: buffer, ContentType: 'application/pdf',
      }));
      process.stdout.write(`  PDF: "${title.slice(0, 48)}" (${(buffer.length / 1024).toFixed(0)} KB)\n`);
      result.set(title, s3Url);
    } catch (err) {
      // 3. Last resort: download the fallback paper itself.
      console.warn(`  PDF failed "${title}": ${(err as Error).message} — retrying with fallback`);
      try {
        const fb = await fetch(LAST_RESORT_PDF, {
          headers: { 'User-Agent': 'MaterialCrate-Seeder/1.0' },
          signal: AbortSignal.timeout(30000), redirect: 'follow',
        });
        const buf = Buffer.from(await fb.arrayBuffer());
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: buf, ContentType: 'application/pdf',
        }));
        result.set(title, s3Url);
      } catch {
        result.set(title, `https://${bucket}.s3.${region}.amazonaws.com/documents/seed-ocw-fallback.pdf`);
      }
    }

    // Pace: arxiv asks for ≤3 req/sec and we're also downloading PDFs.
    await new Promise((r) => setTimeout(r, 1200));
  }

  return result;
}

// ─── PDF Thumbnail Generation ─────────────────────────────────────────────────
// Renders the first page of each department's PDF and uploads the JPEG to the
// public S3 bucket, matching the real createPost thumbnail flow exactly.

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(obj: ReturnType<NodeCanvasFactory['create']>, width: number, height: number) {
    obj.canvas.width = width;
    obj.canvas.height = height;
  }
  destroy(obj: ReturnType<NodeCanvasFactory['create']>) {
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
  const canvasObj = factory.create(Math.floor(viewport.width), Math.floor(viewport.height));

  await page.render({
    canvasContext: canvasObj.context as any,
    viewport,
    canvasFactory: factory as any,
  }).promise;

  const pngBuffer = canvasObj.canvas.toBuffer('image/png');
  factory.destroy(canvasObj);

  // Resize to max 800px wide and convert to JPEG — same quality level the app uses
  return sharp(pngBuffer)
    .resize(800, null, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function generateCourseThumbnails(
  courses: Array<{ title: string }>,
): Promise<Map<string, string>> {
  const publicBucket = process.env.AWS_S3_PUBLIC_BUCKET;
  const privateBucket = process.env.AWS_S3_PRIVATE_BUCKET;
  const cfBase = (process.env.CLOUDFRONT_URL ?? '').replace(/\/$/, '');
  const result = new Map<string, string>();

  if (!publicBucket || !privateBucket || !cfBase) {
    console.warn('  S3 or CloudFront env vars missing — thumbnails will be null.');
    return result;
  }

  console.log(`Generating thumbnails for ${courses.length} courses...`);

  for (const { title } of courses) {
    const slug = sanitizeName(title).slice(0, 80);
    const thumbKey = `thumbnails/seed-ocw-${slug}.jpg`;
    const cfUrl = `${cfBase}/${thumbKey}`;

    try {
      await s3.send(new HeadObjectCommand({ Bucket: publicBucket, Key: thumbKey }));
      result.set(title, cfUrl);
      continue;
    } catch {
      // Not found — generate
    }

    const pdfKey = `documents/seed-ocw-${slug}.pdf`;
    try {
      const getRes = await s3.send(new GetObjectCommand({ Bucket: privateBucket, Key: pdfKey }));
      const chunks: Buffer[] = [];
      for await (const chunk of getRes.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const jpegBuffer = await pdfFirstPageToJpeg(Buffer.concat(chunks));
      await s3.send(new PutObjectCommand({
        Bucket: publicBucket, Key: thumbKey, Body: jpegBuffer, ContentType: 'image/jpeg',
      }));
      process.stdout.write(`  Thumbnail: "${title.slice(0, 50)}"\n`);
      result.set(title, cfUrl);
    } catch (err) {
      console.warn(`  Thumbnail failed "${title}": ${(err as Error).message}`);
    }
  }

  return result;
}


// ─── OCW Live Scraper (best-effort) ──────────────────────────────────────────

async function scrapeOcwCourses(): Promise<OcwCourse[]> {
  const scraped: OcwCourse[] = [];
  const departments = ['mathematics', 'physics', 'computer+science', 'biology', 'economics'];

  for (const dept of departments) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(
        `https://ocw.mit.edu/search/?q=${dept}&f=Courses`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'MaterialCrate-Seeder/1.0', Accept: 'text/html' },
        }
      );
      clearTimeout(timer);
      if (!res.ok) continue;

      const html = await res.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!match) continue;

      const data = JSON.parse(match[1]);
      const results: Record<string, unknown>[] =
        data?.props?.pageProps?.results ??
        data?.props?.pageProps?.searchData?.results ??
        [];

      for (const r of results) {
        const title = (r['title'] as string | undefined)?.trim();
        const description = (r['description'] as string | undefined)?.trim();
        const url = r['url'] as string | undefined;
        const deptArr = r['department'] as string[] | undefined;
        const termStr = (r['term'] as string | undefined) ?? '';
        const yearMatch = termStr.match(/\d{4}/);

        if (!title || !url) continue;
        if (COURSES.some((c) => c.title === title)) continue;

        scraped.push({
          title,
          department: deptArr?.[0] ?? dept,
          courseNumber: ((r['course_numbers'] as { course_number?: string }[] | undefined)?.[0]?.course_number) ?? '',
          description: description ?? `MIT OpenCourseWare course: ${title}.`,
          fileUrl: `https://ocw.mit.edu${url}`,
          year: yearMatch ? parseInt(yearMatch[0]) : 2020,
          categories: [dept.replace('+', ' '), 'academics'],
        });
      }
      await new Promise((r) => setTimeout(r, 800));
    } catch {
      // swallow — fall through to hardcoded data
    }
  }
  return scraped;
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed() {
  const existingCount = await prisma.post.count();
  console.log(`Database has ${existingCount} existing posts — adding OCW posts alongside them.`);

  if (process.argv.includes('--reset')) {
    console.log('--reset: removing previous seed users and their posts...');
    await prisma.user.deleteMany({ where: { email: { in: SEED_USERS.map((u) => u.email) } } });
  }

  // ── Scrape additional courses ──
  console.log('Attempting live scrape from MIT OCW...');
  const scraped = await scrapeOcwCourses();
  console.log(`Scraped ${scraped.length} additional courses.`);
  const allCourses = [...COURSES, ...scraped];
  console.log(`Total courses available: ${allCourses.length}`);

  // ── Hash shared password ──
  const passwordHash = await bcrypt.hash('SeedPassword123!', 10);

  // ── Create or reuse users ──
  console.log('Creating users (skipping any that already exist)...');
  const createdUsers = await Promise.all(
    SEED_USERS.map(async (u, idx) => {
      const existing = await prisma.user.findFirst({ where: { email: u.email } });
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
    })
  );

  const prolificUser = createdUsers.find((_, i) => SEED_USERS[i].prolific)!;
  const regularUsers = createdUsers.filter((u) => u.id !== prolificUser.id);

  // ── Distribute courses: prolific gets first 20, rest split among regulars ──
  const shuffled = [...allCourses].sort(() => Math.random() - 0.5);
  const prolificCourses = shuffled.slice(0, 20);
  const remaining = shuffled.slice(20);

  type Assignment = { user: (typeof createdUsers)[0]; course: OcwCourse };
  const assignments: Assignment[] = prolificCourses.map((course) => ({ user: prolificUser, course }));

  remaining.forEach((course, i) => {
    assignments.push({ user: regularUsers[i % regularUsers.length], course });
  });

  // ── Per-course PDFs then thumbnails (PDFs must exist before rendering) ──
  const courseList = assignments.map((a) => ({ title: a.course.title, department: a.course.department }));
  const fileUrlByCourse = await ensureCoursePdfsOnS3(courseList);
  const thumbnailByCourse = await generateCourseThumbnails(courseList);

  // ── Create posts + PostVersions ──
  // NOTE: we use prisma.post.create() directly here, bypassing the createPost
  // GraphQL mutation. That means the plagiarism pipeline (DocumentFingerprint,
  // ContentChunk, PlagiarismCase) is NEVER triggered for seeded posts. Real
  // users can upload any of the same content without being flagged.
  console.log(`Seeding ${assignments.length} posts...`);
  let count = 0;

  for (const { user, course } of assignments) {
    const thumbnailUrl = thumbnailByCourse.get(course.title) ?? null;
    const fileUrl = fileUrlByCourse.get(course.title)!;
    await prisma.post.create({
      data: {
        title: course.title,
        fileUrl,
        fileType: 'pdf',
        thumbnailUrl,
        categories: course.categories,
        description: `[${course.courseNumber}] ${course.description}`,
        year: course.year,
        isFree: true,
        price: 0,
        authorId: user.id,
        versions: {
          create: {
            versionNumber: 1,
            title: course.title,
            categories: course.categories,
            description: `[${course.courseNumber}] ${course.description}`,
            year: course.year,
            fileUrl,
            thumbnailUrl,
            fileType: 'pdf',
            editorId: user.id,
          },
        },
      },
    });

    count++;
    if (count % 10 === 0) process.stdout.write(`  ${count}/${assignments.length}\n`);
  }

  console.log(`\nDone! Created ${createdUsers.length} users and ${count} posts.`);
  console.log(`  Prolific user: ${prolificUser.username} (${prolificCourses.length} posts)`);
  console.log(`  Regular users: ${regularUsers.length} users sharing ${remaining.length} posts`);
  console.log('\nSeed user credentials:');
  console.log('  Password for all: SeedPassword123!');
  SEED_USERS.forEach((u) => console.log(`  ${u.email}`));
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
