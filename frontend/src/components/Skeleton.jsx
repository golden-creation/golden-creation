import React from "react";

export function SkeletonBlock({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 ${className}`}
      aria-hidden="true"
    />
  );
}

export function PageLoader({ label = "Loading page" }) {
  return (
    <div className="min-h-screen bg-[#FBF8F2] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <span className="sr-only">{label}</span>
        <SkeletonBlock className="h-9 w-44" />
        <SkeletonBlock className="mt-4 h-4 w-full max-w-xl" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <SkeletonBlock key={item} className="h-40" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <SkeletonBlock className="aspect-square w-full" />
          <SkeletonBlock className="mt-3 h-4 w-3/4" />
          <SkeletonBlock className="mt-2 h-3 w-1/2" />
          <SkeletonBlock className="mt-4 h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
      <div className="flex gap-3">
        <div className="hidden w-16 shrink-0 space-y-3 sm:block">
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock key={item} className="h-16 w-16" />
          ))}
        </div>
        <SkeletonBlock className="aspect-square min-h-[300px] flex-1" />
      </div>
      <div>
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="mt-4 h-8 w-4/5" />
        <SkeletonBlock className="mt-3 h-8 w-52" />
        <SkeletonBlock className="mt-6 h-28 w-full" />
        <SkeletonBlock className="mt-6 h-12 w-full" />
        <SkeletonBlock className="mt-3 h-12 w-full" />
      </div>
    </div>
  );
}
