"use client";

import Link from "next/link";

export default function MealsError({ reset }: { reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-emerald-50 p-5 text-emerald-950"><section role="alert" className="max-w-xl rounded-3xl bg-white p-7 shadow-lg"><h1 className="text-2xl font-bold">Let’s try opening Meals again</h1><p className="mt-3 text-lg">We couldn’t display this page. Please check your connection and try again.</p><button className="mt-5 rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white" onClick={reset}>Try again</button><Link className="ml-4 inline-flex min-h-11 items-center font-bold underline" href="/">Hub Home</Link></section></main>;
}
