"use client";

import type { ReactNode } from "react";
import { sideOf, toggled } from "@/lib/coverage";
import type { Coverage, CoverageRegion, CoverageSide, Place } from "@/lib/types";
import { editCoverage, pickCoverageSide, setCoverageOpen, setCoverageQuery, toggleCoverageShown, useViewer }
  from "@/store/viewer";
import { Switch } from "../ui/Switch";
import { Sym } from "../ui/Sym";

interface TickProps {
  title: string;
  isTicked: boolean;
  isOther: boolean;
  onPick: () => void;
  region?: boolean;
  disabled?: boolean;
  id?: string;
  label?: string;
  narrow?: boolean;
}

function TickRow({ title, isTicked, isOther, onPick, region, disabled, id, label, narrow }: TickProps) {
  const words = useViewer((state) => state.words);
  const side = useViewer((state) => state.coverageSide);
  const isIn = side === "include";
  const mark = isTicked ? (isIn ? "checkmark.circle.fill" : "minus.circle.fill") : "circle";
  return (
    <button type="button" className={region ? "row region" : "row"} aria-pressed={isTicked} aria-label={label}
      disabled={disabled} data-id={id} style={narrow ? { width: "auto" } : undefined} onClick={onPick}>
      <span className="words">{title}</span>
      {isOther && !isTicked ? <span className="other">{isIn ? words.excludedRow : words.includedRow}</span> : null}
      <Sym name={mark} className={isTicked && !isIn ? "tick out" : "tick"} />
    </button>
  );
}

function Fold({ id, isOpen, onToggle, children }: { id?: string; isOpen: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className="row" id={id} aria-expanded={isOpen} onClick={onToggle}>
      <span className="words">{children}</span><Sym name={isOpen ? "chevron.down" : "chevron.forward"} />
    </button>
  );
}

interface Sides {
  here: CoverageSide;
  other: CoverageSide;
}

function RegionTick({ region, isWhole, here, other }: Sides & { region: CoverageRegion; isWhole: boolean }) {
  return (
    <TickRow title={region.name} isTicked={isWhole || (here.regions ?? []).includes(region.id)}
      isOther={(other.regions ?? []).includes(region.id)} region disabled={isWhole} id={region.id}
      onPick={() => editCoverage((made) => { made.regions = toggled(region.id, made.regions); })} />
  );
}

function CountryRows({ country, regions, here, other }: Sides & { country: Place; regions: CoverageRegion[] }) {
  const opened = useViewer((state) => state.coverageOpen.get(country.id));
  const isWhole = (here.countries ?? []).includes(country.id);
  const isOpen = opened ?? regions.some((region) => (here.regions ?? []).includes(region.id));
  return (
    <>
      <div className="row" data-country={country.id}>
        {regions.length === 0
          // A country without regions has nothing to unfold: its name is words, not a button.
          ? <span className="row" style={{ flex: 1 }}><span className="words">{country.name}</span></span>
          : <button type="button" className="row" style={{ flex: 1 }} aria-expanded={isOpen}
            onClick={() => setCoverageOpen(country.id, !isOpen)}>
            <span className="words">{country.name}</span><Sym name={isOpen ? "chevron.down" : "chevron.forward"} />
          </button>}
        <TickRow title="" isTicked={isWhole} isOther={(other.countries ?? []).includes(country.id)} id={country.id}
          label={country.name} narrow
          onPick={() => editCoverage((made) => { made.countries = toggled(country.id, made.countries); })} />
      </div>
      {isOpen ? regions.map((region) => (
        <RegionTick key={region.id} region={region} isWhole={isWhole} here={here} other={other} />
      )) : null}
    </>
  );
}

function Countries({ here, other }: Sides) {
  const words = useViewer((state) => state.words);
  const places = useViewer((state) => state.coveragePlaces);
  const query = useViewer((state) => state.coverageQuery);
  if (!places) return null;
  const byCountry = new Map<string, CoverageRegion[]>();
  for (const region of places.regions.filter((each) => !each.isRange)) {
    byCountry.set(region.country, [...(byCountry.get(region.country) ?? []), region]);
  }
  const wanted = query.trim().toLowerCase();
  const countryOf = new Map(places.regions.map((region) => [region.id, region.country]));
  const whole = here.countries ?? [];
  const fromRegions = [...new Set((here.regions ?? []).map((id) => countryOf.get(id)).filter((code) => code != null))]
    .filter((code) => !whole.includes(code));
  const picked = [...whole, ...fromRegions];
  const rest = places.countries.filter((each) => !picked.includes(each.id) && (!wanted
    || each.name.toLowerCase().includes(wanted) || each.id.toLowerCase() === wanted));
  const named = (code: string) => places.countries.find((each) => each.id === code) ?? { id: code, name: code };
  const ordered = [...picked.map(named), ...rest.filter((each) => byCountry.has(each.id)),
    ...rest.filter((each) => !byCountry.has(each.id))];
  return (
    <>
      <h2 className="title">{words.countries}</h2>
      <div className="field">
        <input type="search" id="coverageSearch" autoComplete="off" placeholder={words["search.country"]}
          aria-label={words["search.country"]} value={query} onChange={(event) => setCoverageQuery(event.target.value)} />
      </div>
      <div className="list countries" id="coverageCountries">
        {ordered.map((country) => (
          <CountryRows key={country.id} country={country} regions={byCountry.get(country.id) ?? []} here={here} other={other} />
        ))}
      </div>
    </>
  );
}

function Pickers({ coverage }: { coverage: Coverage }) {
  const words = useViewer((state) => state.words);
  const side = useViewer((state) => state.coverageSide);
  const places = useViewer((state) => state.coveragePlaces);
  const rangesOpen = useViewer((state) => state.coverageOpen.get("ranges") === true);
  if (!places) return null;
  const here = sideOf(coverage, side);
  const other = sideOf(coverage, side === "include" ? "exclude" : "include");
  const ranges = places.regions.filter((region) => region.isRange);
  return (
    <div className="coverage" id="coveragePickers">
      <div className="chips" role="group" aria-label={words.sideWord}>
        {(["include", "exclude"] as const).map((each) => (
          <button key={each} type="button" className={each === side ? "picked" : undefined} aria-pressed={each === side}
            onClick={() => pickCoverageSide(each)}>{words[`side.${each}`]}</button>
        ))}
      </div>
      <div className="foot-note">{side === "include" ? words.includeNote : words.excludeNote}</div>
      <div className="card"><div className="row">
        <span className="words">{words.world}</span>
        <Switch isOn={here.world === true} label={words.world}
          onChange={(isOn) => editCoverage((made) => { made.world = isOn ? true : undefined; })} />
      </div></div>
      {side === "include" ? <div className="foot-note">{words.worldNote}</div> : null}
      <h2 className="title">{words.continents}</h2>
      <div className="list">
        {places.continents.map((each) => (
          <TickRow key={each.id} title={each.name} isTicked={(here.continents ?? []).includes(each.id)}
            isOther={(other.continents ?? []).includes(each.id)}
            onPick={() => editCoverage((made) => { made.continents = toggled(each.id, made.continents); })} />
        ))}
      </div>
      <h2 className="title">{places.mountains}</h2>
      <div className="list">
        <TickRow title={words.everyRange} isTicked={here.mountains === true} isOther={other.mountains === true}
          onPick={() => editCoverage((made) => { made.mountains = made.mountains ? undefined : true; })} />
        {ranges.length ? <Fold id="coverageRanges" isOpen={rangesOpen} onToggle={() => setCoverageOpen("ranges", !rangesOpen)}>
          {words.ranges}</Fold> : null}
        {ranges.length && rangesOpen ? ranges.map((range) => (
          <RegionTick key={range.id} region={range} isWhole={here.mountains === true} here={here} other={other} />
        )) : null}
      </div>
      <Countries here={here} other={other} />
    </div>
  );
}

/** Where the map works, as the phone's Coverage page picks it: each side on its own. */
export function CoverageCard() {
  const words = useViewer((state) => state.words);
  const summary = useViewer((state) => state.coverage);
  const places = useViewer((state) => state.coveragePlaces);
  const isShown = useViewer((state) => state.coverageShown);
  const isReady = summary != null && places != null;
  return (
    <div id="coverageBox">
      <h2 className="title">{words.coverage}</h2>
      <div className="card" id="coverage">
        {isReady ? (
          <>
            <div className="field" id="coverageLine">{summary.line}</div>
            {summary.required ? <div className="field" id="coverageRequired">{summary.required}
              <small>{words.opensDownloaded}</small></div> : null}
            {summary.warnings.map((warning) => (
              <div className="field warning" role="alert" key={warning}>
                <Sym name="exclamationmark.triangle.fill" />{` ${warning}`}
              </div>
            ))}
            <Fold id="coverageToggle" isOpen={isShown} onToggle={toggleCoverageShown}>{words.coverage}</Fold>
          </>
        ) : null}
      </div>
      {isReady ? <div className="foot-note">{words.coverageLead}</div> : null}
      {isReady && isShown ? <Pickers coverage={summary.coverage ?? {}} /> : null}
    </div>
  );
}
