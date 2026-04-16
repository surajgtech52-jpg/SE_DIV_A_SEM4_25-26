import { useState } from "react";

export default function SearchSelect({ label, items, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <label className="block text-sm font-bold uppercase mb-1">{label}</label>

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full p-2 border border-black"
        placeholder={`Search ${label}`}
      />

      {open && query && (
        <div className="absolute z-10 w-full bg-white border border-black max-h-40 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-2 text-gray-400 text-sm">No matches</div>
          )}
          {filtered.map(item => (
            <div
              key={item.id}
              className="p-2 cursor-pointer hover:bg-gray-100"
              onClick={() => {
                setQuery(item.name);
                setOpen(false);
                onSelect(item);
              }}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
