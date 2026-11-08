import { featureRows, featureTitle } from "@/lib/feature";

interface Props {
  properties: Record<string, unknown>;
  layer: string;
}

/** Values are a server's words: they go in as text, never as markup. */
export function FeatureCard({ properties, layer }: Props) {
  const title = featureTitle(properties);
  return (
    <div className="feature">
      {title ? <b>{title}</b> : null}
      {layer ? <small>{layer}</small> : null}
      <dl>
        {featureRows(properties).flatMap(([key, value]) => [<dt key={`${key}-k`}>{key}</dt>, <dd key={key}>{value}</dd>])}
      </dl>
    </div>
  );
}
