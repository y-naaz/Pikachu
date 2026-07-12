// Code-first display. If the snippet looks like a diff (lines starting with
// + / -), color those lines green/red so before→after fixes read at a glance.

export function CodeBlock({ code }: { code: string }) {
  const lines = code.replace(/\n$/, "").split("\n");
  const isDiff = lines.some((l) => /^[+-](?![+-])/.test(l) || /^[+-]\s/.test(l));

  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-surface-2 text-sm leading-6">
      <code className="block font-mono">
        {lines.map((ln, i) => {
          let cls = "text-foreground/90";
          if (isDiff && ln.startsWith("+")) cls = "bg-[#7ee787]/10 text-[#7ee787]";
          else if (isDiff && ln.startsWith("-")) cls = "bg-[#ff7b72]/10 text-[#ff7b72]";
          return (
            <span key={i} className={`block px-4 ${cls}`}>
              {ln || " "}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
