// pos-frontend/src/features/sales/components/SaleDrawerTabs.tsx

export function SaleDrawerTabs(props: { activeTab: "details"|"returns"; onChange: (t: "details"|"returns") => void }) {
  const { activeTab, onChange } = props;
  return (
    <div className="mt-3 flex items-center gap-2">
      <button onClick={()=>onChange("details")}
        className={`rounded-md px-2 py-1 text-xs ${activeTab==="details"?"bg-white/10 text-white":"text-zinc-300 hover:bg-white/5"}`}>Details</button>
      <button onClick={()=>onChange("returns")}
        className={`rounded-md px-2 py-1 text-xs ${activeTab==="returns"?"bg-white/10 text-white":"text-zinc-300 hover:bg-white/5"}`}>Returns</button>
    </div>
  );
}
