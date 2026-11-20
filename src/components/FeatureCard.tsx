import { featureRows, featureTitle } from "@/lib/feature";
import type { DetailsBlock, DetailsSheet } from "@/lib/types";
import { ConnectionCard, LivePill } from "./Connection";

interface Props {
  properties: Record<string, unknown>;
  layer: string;
  details?: DetailsSheet | null;
  /** 130 When the phone answered `details`, from which a LIVE pill counts the age on. */
  asked?: number;
  /** 129 What a search listed it as, for a feature whose tags hold no name. */
  title?: string;
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.flatMap(([key, value], index) => [<dt key={`${index}-k`}>{key}</dt>, <dd key={index}>{value}</dd>])}
    </dl>
  );
}

/** 28: a link or picture opens only on the web, whatever the data wrote. */
export function webAddress(text?: string | null): string | null {
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function Block({ block, tags, answeredAt }: { block: DetailsBlock; tags: [string, string][]; answeredAt?: Date }) {
  switch (block.kind) {
    case "rows":
      return block.connection ? <ConnectionCard connection={block.connection} answeredAt={answeredAt} />
        : <Rows rows={(block.rows ?? []).map((row) => [row.title, row.value])} />;
    case "text":
      return (
        <p className={block.warning ? "feature-note warning" : "feature-note"}>
          {block.title ? <small>{block.title}</small> : null}
          {block.text}
        </p>
      );
    case "link": {
      const href = webAddress(block.text);
      return href ? <a className="feature-link" href={href} target="_blank" rel="noopener noreferrer">{block.title || href}</a> : null;
    }
    case "image": {
      const src = webAddress(block.text);
      return src ? <div className="feature-image" role="img" aria-label={block.title ?? ""}
        style={{ backgroundImage: `url(${JSON.stringify(src)})` }} /> : null;
    }
    case "allTags":
      return <Rows rows={tags} />;
    default:
      return null;
  }
}

/** Values are a server's words: they go in as text, never as markup. 21: a layout's sections first. */
export function FeatureCard({ properties, layer, details, asked, title: listed }: Props) {
  const title = details?.title || listed || featureTitle(properties);
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
  const { live } = details;
  const answeredAt = asked != null && live?.ageSeconds != null ? new Date(asked - live.ageSeconds * 1000) : undefined;
  return (
    <div className="feature">
      {title ? <b>{title}</b> : null}
      {layer ? <small>{layer}</small> : null}
      {live ? <div className="feature-live"><LivePill live={live} asked={asked} /></div> : null}
      {details.sections.map((section, index) => (
        <section key={index}>
          {section.title ? <h4>{section.title}</h4> : null}
          {section.blocks.map((block, at) => <Block key={at} block={block} tags={tags} answeredAt={answeredAt} />)}
        </section>
      ))}
    </div>
  );
}
