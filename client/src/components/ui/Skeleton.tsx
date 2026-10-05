import React from 'react';

export interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  rounded?: string;
}

export function Skeleton({
  className = '',
  width,
  height,
  rounded = 'rounded-lg',
}: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${rounded} ${className}`}
      style={{
        width,
        height,
      }}
    />
  );
}

export function SkeletonCard({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={`faisaa-card finora-card bg-[#111218] border border-white/[0.06] rounded-xl p-5 space-y-4 ${className}`}
    >
      {children || (
        <>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-3 w-full" />
        </>
      )}
    </div>
  );
}

export function SkeletonMetric({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${count} gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="faisaa-card finora-card bg-[#111218] border border-white/[0.06] rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-36" />
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-3.5 w-12 rounded" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="faisaa-card finora-card bg-[#111218] border border-white/[0.06] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <Skeleton className="h-5 w-36" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>
      <div className="space-y-3 pt-1">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
            <div className="text-right space-y-1.5">
              <Skeleton className="h-4 w-24 ml-auto" />
              <Skeleton className="h-2.5 w-14 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ height = 'h-64' }: { height?: string }) {
  return (
    <div className="faisaa-card finora-card bg-[#111218] border border-white/[0.06] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-14 rounded-lg" />
          <Skeleton className="h-7 w-14 rounded-lg" />
        </div>
      </div>
      <div className={`w-full ${height} flex items-end justify-between gap-3 pt-6 pb-2 px-4`}>
        {Array.from({ length: 8 }).map((_, idx) => {
          const heights = ['h-24', 'h-40', 'h-32', 'h-52', 'h-36', 'h-48', 'h-28', 'h-44'];
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <Skeleton className={`w-full max-w-[42px] ${heights[idx % heights.length]} rounded-t-md`} />
              <Skeleton className="h-2.5 w-8" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05]"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
