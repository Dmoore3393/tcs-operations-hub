/** Only the language preference uses server cookies. Authorization remains in the live API. */
export function staticRootLayout(source) {
  const declaration = 'const language=(await cookies()).get("tcs_language")?.value==="es"?"es":"en";';
  if (!source.includes(declaration)) throw new Error('Review the root language layout before packaging iOS.');
  const result = source.replace('import {cookies} from "next/headers";\n', '').replace(declaration, 'const language="en";');
  if (result.includes('next/headers') || /cookies\s*\(/.test(result)) throw new Error('The packaged layout still depends on a server request.');
  return result;
}

export function staticPlannerPage(component) {
  if (!['WeeklyCarePlanner','DailyRatioPlan'].includes(component)) throw new Error('Unsupported native planner page.');
  return `"use client";
import {useEffect,useState} from "react";
import ${component} from "@/components/scheduling/${component}";
import {plannerPageSelection} from "@/lib/weekly-care-planner";
export default function Page(){
 const [selection,setSelection]=useState<ReturnType<typeof plannerPageSelection>|null>(null);
 useEffect(()=>{setSelection(plannerPageSelection(Object.fromEntries(new URLSearchParams(window.location.search))));},[]);
 return selection?<${component} {...selection}/>:<p role="status">Loading care plan…</p>;
}
`;
}
