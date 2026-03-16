const ROLES = ['operator', 'supervisor', 'engineer', 'designer'];

export interface RoleSelectorProps {
  selected: string[];
  onChange: (roles: string[]) => void;
}

export function RoleSelector({ selected, onChange }: RoleSelectorProps) {
  const toggle = (role: string) => {
    onChange(selected.includes(role) ? selected.filter(r => r !== role) : [...selected, role]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {ROLES.map(role => (
        <button
          key={role}
          onClick={() => toggle(role)}
          className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${
            selected.includes(role) ? 'bg-blue-600/30 text-blue-400' : 'bg-slate-700 text-slate-500'
          }`}
        >
          {role}
        </button>
      ))}
      {selected.length > 0 && (
        <span className="text-[10px] text-slate-500 self-center ml-1">({selected.length === 0 ? 'all' : selected.join(', ')})</span>
      )}
    </div>
  );
}
