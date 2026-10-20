import Markdown from "@/app/Markdown";
import { chooseMechanisms } from "@/app/actions";
import { parseMechanisms } from "@/lib/brands";

/** The unique-mechanism ideas as cards to tick; the ticked ones become the brand's mechanisms. */
export default function MechanismPicker({ brand, md, chosen }: { brand: string; md: string; chosen: string[] }) {
  const { ideas, after } = parseMechanisms(md);
  if (!ideas.length) return <Markdown text={md} />;
  return (
    <>
      <form action={chooseMechanisms} className="mech-form">
        <input type="hidden" name="brand" value={brand} />
        <p className="muted">
          Tick the mechanisms you like. They're saved as your unique mechanisms, and every iteration, brief and ingredient claim uses them from then on.
        </p>
        <div className="mech-list">
          {ideas.map((i) => (
            <label key={i.n} className="mech-card">
              <input type="checkbox" name="pick" value={i.n} defaultChecked={chosen.includes(i.name)} />
              <span className="mech-tick" aria-hidden="true" />
              <span className="mech-body">
                <span className="mech-name">
                  <span className="mono muted">{String(i.n).padStart(2, "0")}</span> {i.name}
                </span>
                <Markdown text={i.body} />
              </span>
            </label>
          ))}
        </div>
        <div className="mech-foot">
          <button type="submit" className="btn-primary">
            Save my mechanisms
          </button>
        </div>
      </form>
      {after ? <Markdown text={after} /> : null}
    </>
  );
}
