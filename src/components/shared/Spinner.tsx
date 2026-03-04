import React from 'react';

interface SpinnerProps {
  message?: string;
  large?: boolean;
}

export function Spinner({ message, large }: SpinnerProps) {
  return (
    <div className="spinner-container">
      <div className={`spinner${large ? ' spinner--large' : ''}`} />
      {message && <div className="spinner-message">{message}</div>}
    </div>
  );
}
