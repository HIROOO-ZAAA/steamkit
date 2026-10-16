import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  glow = false,
  hover = true,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`card ${glow ? 'card-glow' : ''} ${hover ? 'card-hover' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
};
