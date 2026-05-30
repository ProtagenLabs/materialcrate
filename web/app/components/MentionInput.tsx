"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { User } from "iconsax-reactjs";

type MentionSuggestion = {
  id: string;
  username: string;
  displayName?: string | null;
  profilePicture?: string | null;
};

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  rows?: number;
}

const MENTION_SEARCH_DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 5;

export default function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  maxLength,
  className,
  style,
  multiline,
  rows,
}: MentionInputProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&limit=${MAX_SUGGESTIONS}`,
        { method: "GET", cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      const users: MentionSuggestion[] = Array.isArray(body?.users)
        ? body.users
            .filter(
              (u: { username?: string }) =>
                typeof u.username === "string" && u.username.trim(),
            )
            .slice(0, MAX_SUGGESTIONS)
            .map((u: MentionSuggestion) => ({
              id: u.id,
              username: u.username,
              displayName: u.displayName,
              profilePicture: u.profilePicture,
            }))
        : [];

      setSuggestions(users);
      setIsOpen(users.length > 0);
      setActiveIndex(0);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    }
  }, []);

  const closeSuggestions = useCallback(() => {
    setSuggestions([]);
    setIsOpen(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
    setActiveIndex(0);
  }, []);

  const detectMentionQuery = useCallback(
    (text: string, cursorPos: number) => {
      if (cursorPos <= 0) {
        closeSuggestions();
        return;
      }

      const beforeCursor = text.slice(0, cursorPos);
      const match = beforeCursor.match(/@([A-Za-z0-9._]*)$/);
      if (!match) {
        closeSuggestions();
        return;
      }

      const startIdx = cursorPos - match[0].length;
      const query = match[1];
      setMentionStartIndex(startIdx);
      setMentionQuery(query);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!query) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void fetchSuggestions(query);
      }, MENTION_SEARCH_DEBOUNCE_MS);
    },
    [closeSuggestions, fetchSuggestions],
  );

  const insertMention = useCallback(
    (username: string) => {
      const before = value.slice(0, mentionStartIndex);
      const after = value.slice(mentionStartIndex + 1 + mentionQuery.length);
      const next = `${before}@${username} ${after}`;
      onChange(next);
      closeSuggestions();

      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          const pos = mentionStartIndex + 1 + username.length + 1;
          el.setSelectionRange(pos, pos);
          el.focus();
        }
      });
    },
    [closeSuggestions, mentionQuery.length, mentionStartIndex, onChange, value],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = e.target.value;
      onChange(next);
      const cursorPos = e.target.selectionStart ?? next.length;
      detectMentionQuery(next, cursorPos);
    },
    [detectMentionQuery, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (isOpen && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(suggestions[activeIndex].username);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeSuggestions();
          return;
        }
      }

      if (e.key === "Enter" && !multiline && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    },
    [
      activeIndex,
      closeSuggestions,
      insertMention,
      isOpen,
      multiline,
      onSubmit,
      suggestions,
    ],
  );

  const handleClick = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart ?? value.length;
    detectMentionQuery(value, cursorPos);
  }, [detectMentionQuery, value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const sharedProps = {
    ref: inputRef as any,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onClick: handleClick,
    placeholder,
    disabled,
    maxLength,
    className,
    style,
    autoComplete: "off" as const,
  };

  return (
    <div className="relative w-full">
      {multiline ? (
        <textarea {...sharedProps} rows={rows} />
      ) : (
        <input {...sharedProps} />
      )}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-48 overflow-y-auto rounded-xl border border-[#E4E4E4] bg-surface shadow-lg"
        >
          {suggestions.map((user, index) => (
            <button
              key={user.id}
              type="button"
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                index === activeIndex ? "bg-surface-high" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(user.username);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <div className="w-7 h-7 rounded-full bg-surface-high flex items-center justify-center overflow-hidden shrink-0">
                {user.profilePicture ? (
                  <Image
                    src={user.profilePicture}
                    alt={user.username}
                    width={28}
                    height={28}
                    className="w-full h-full object-cover rounded-full"
                    unoptimized
                  />
                ) : (
                  <User size={12} color="#808080" variant="Bold" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink truncate">
                  {user.displayName || user.username}
                </p>
                <p className="text-[10px] text-ink-3 truncate">
                  @{user.username}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
