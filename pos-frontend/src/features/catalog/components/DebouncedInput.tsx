import React from "react";


export function DebouncedInput({ value, onChange, delay = 400, placeholder, className = "" }: {
value: string; onChange: (v: string) => void; delay?: number; placeholder?: string; className?: string;
}) {
const [inner, setInner] = React.useState(value);
React.useEffect(() => setInner(value), [value]);
React.useEffect(() => {
const t = setTimeout(() => onChange(inner), delay);
return () => clearTimeout(t);
}, [inner, delay]);
return (
<input
className={`w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
value={inner}
onChange={(e) => setInner(e.target.value)}
placeholder={placeholder}
/>
);
}