'use client';

import React, { useState, useEffect } from 'react';

interface UserAvatarProps {
  src?: string;
  name: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBorder?: boolean;
}

const sizeClasses = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-12 text-lg',
  xl: 'size-24 text-3xl',
};

export function UserAvatar({
  src,
  name,
  className = '',
  size = 'sm',
  showBorder = true,
}: UserAvatarProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  const sizeClass = sizeClasses[size] || sizeClasses.sm;
  const initial = (name || 'U').charAt(0).toUpperCase();

  if (src && !error) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${
          showBorder ? 'border border-slate-200 shadow-2xs' : ''
        } ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs ${className}`}
    >
      {initial}
    </div>
  );
}
