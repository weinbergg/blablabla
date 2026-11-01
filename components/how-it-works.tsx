export function HowItWorks({
  steps,
}: {
  steps: { title: string; text: string }[];
}) {
  return (
    <ol className="mt-8 grid gap-8 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.title}>
          <p className="font-serif text-2xl text-rust">{index + 1}</p>
          <p className="mt-2 font-medium">{step.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}
