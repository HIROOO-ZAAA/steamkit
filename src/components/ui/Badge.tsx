import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "purple" | "cyan" | "green" | "amber" | "red" | "gray";
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "gray",
  className = "",
  ...props
}) => {
  return (
    <span className={`badge badge-${variant} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
};
