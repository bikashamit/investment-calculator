import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Investment Calculator</h1>
      <Link href="/calculator" className="text-blue-600 underline">
        Go to Calculator
      </Link>
    </main>
  );
}