"use client";

import React from "react";

interface AlertProps {
  message: string | null;
  type: "success" | "error" | "info";
  className?: string;
}

const typeStyles: Record<AlertProps["type"], string> = {
  success: "text-green-600",
  error: "text-red-500",
  info: "text-amber-700",
};

export default function Alert({ message, type, className }: AlertProps) {
  if (!message) return null;

  return (
    <p
      role="alert"
      aria-live="polite"
      className={`text-sm ${typeStyles[type]}${className ? ` ${className}` : ""}`}
    >
      {message}
    </p>
  );
}
