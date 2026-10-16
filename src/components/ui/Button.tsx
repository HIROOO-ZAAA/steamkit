import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  asChild?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  asChild = false,
  className = "",
  disabled,
  ...props
}) => {
  const baseClass = "btn";
  const variantClass = `btn-${variant}`;
  const sizeClass = size !== "md" ? `btn-${size}` : "";
  const loadingClass = isLoading ? "btn-loading" : "";
  const fullClassName =
    `${baseClass} ${variantClass} ${sizeClass} ${loadingClass} ${className}`.trim();

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<
      Record<string, unknown> & { className?: string }
    >;
    const childProps = {
      ...props,
      className: `${fullClassName} ${child.props.className || ""}`.trim(),
    } as Partial<typeof child.props>;

    return React.cloneElement(child, childProps);
  }

  return (
    <button
      className={fullClassName}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className="btn-spinner" />}
      {children}
    </button>
  );
};

export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button {...props} variant="secondary" />;
}
