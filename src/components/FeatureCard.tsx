import { featureRows, featureTitle } from "@/lib/feature";
import type { DetailsBlock, DetailsSheet } from "@/lib/types";

interface Props {
  properties: Record<string, unknown>;
  layer: string;
  details?: DetailsSheet | null;
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.flatMap(([key, value], index) => [<dt key={`${index}-k`}>{key}</dt>, <dd key={index}>{value}</dd>])}
    </dl>
  );
}

function Block({ block, tags }: { block: DetailsBlock; tags: [string, string][] }) {
  switch (block.kind) {
    case "rows":
      return <Rows rows={(block.rows ?? []).map((row) => [row.title, row.value])} />;
    case "text":
      return (
        <p className={block.warning ? "feature-note warning" : "feature-note"}>
          {block.title ? <small>{block.title}</small> : null}
          {block.text}
        </p>
      );
    case "allTags":
      return <Rows rows={tags} />;
    default:
      return null;
  }
}

/** Values are a server's words: they go in as text, never as markup. 21: a layout's sections first. */
export function FeatureCard({ properties, layer, details }: Props) {
  const title = details?.title || featureTitle(properties);
  if (!details) {
    return (
      <div className="feature">
        {title ? <b>{title}</b> : null}
        {layer ? <small>{layer}</small> : null}
        <Rows rows={featureRows(properties)} />
      </div>
    );
  }
  const read = new Set(details.keys);
  const tags = featureRows(properties).filter(([key]) => !read.has(key));
  return (
    <div className="feature">
      {title ? <b>{title}</b> : null}
      {layer ? <small>{layer}</small> : null}
      {details.sections.map((section, index) => (
        <section key={index}>
          {section.title ? <h4>{section.title}</h4> : null}
          {section.blocks.map((block, at) => <Block key={at} block={block} tags={tags} />)}
        </section>
      ))}
    </div>
  );
}
