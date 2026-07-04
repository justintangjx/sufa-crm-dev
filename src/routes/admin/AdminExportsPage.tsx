import { PageHead } from "../../components/shell/PagePrimitives";

export function AdminExportsPage() {
  return (
    <>
      <PageHead title="Exports" subtitle="CSV export workspace." eyebrow="Admin" />
      <section className="card stack">
        <h2>Available exports</h2>
        <ul>
          <li>All athletes</li>
          <li>Campaign players</li>
          <li>Campaign readiness</li>
          <li>Coach evaluation summary</li>
        </ul>
      </section>
    </>
  );
}
