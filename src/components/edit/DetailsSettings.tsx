"use client";

import type { DetailsLayout, LayoutBlock, LayoutButton } from "@/lib/types";
import { useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

type Send = (query: Record<string, string>) => void;
type Place = Record<string, string>;

const flag = (on: boolean) => (on ? "1" : "0");

function Choice({ label, value, options, onPick }:
  { label: string; value: string; options: { id: string; title: string }[]; onPick: (id: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onPick(event.target.value)}>
      {options.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
    </select>
  );
}

function Check({ label, isOn, onChange }: { label: string; isOn: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={isOn} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** The marks offered, the one worn first; blank is the app's own. */
function SymbolChoice({ label, value, layout, none, onPick }:
  { label: string; value?: string | null; layout: DetailsLayout; none: string; onPick: (symbol: string) => void }) {
  const symbols = [...new Set([...(value ? [value] : []), ...(layout.symbols ?? [])])];
  return <Choice label={label} value={value ?? ""} onPick={onPick}
    options={[{ id: "", title: none }, ...symbols.map((symbol) => ({ id: symbol, title: symbol }))]} />;
}

/** The header's title template and icon, both sent each time as the phone stores both. */
export function HeaderFields({ layout, send }: { layout: DetailsLayout; send: Send }) {
  const { words } = layout;
  const header = layout.header;
  if (!header) return null;
  const set = (fields: Record<string, string>) =>
    send({ details: "header", title: header.title ?? "", symbol: header.symbol ?? "", ...fields });
  return (
    <div className="layout-header block-fields" data-part="header">
      <span className="words">{words.header}</span>
      <CommitField value={header.title ?? ""} aria-label={`${words.header} ${words.heading}`}
        placeholder={words.layerIcon} spellCheck={false} onCommit={(title) => set({ title })} />
      <SymbolChoice label={`${words.header} ${words.icon}`} value={header.symbol} layout={layout}
        none={words.layerIcon ?? ""} onPick={(symbol) => set({ symbol })} />
      <small>{words.headerTitleNote}</small>
    </div>
  );
}

/** A custom button as Button settings sets it, wherever it stands. */
export function ButtonFields({ button, place, layout, send }:
  { button: LayoutButton; place: Place; layout: DetailsLayout; send: Send }) {
  const { words } = layout;
  const choices = layout.choices ?? {};
  const set = (fields: Record<string, string>) => send({
    details: "button", ...place, label: button.label, symbol: button.symbol ?? "", look: button.look,
    action: button.action, template: button.template ?? "", subject: button.subject ?? "",
    body: button.body ?? "", hides: flag(button.hides), ...fields,
  });
  const field = choices.buttonKinds?.find((kind) => kind.id === button.action)?.detail ?? words.link;
  return (
    <div className="block-fields button-fields" data-button={button.id}>
      <CommitField value={button.label} aria-label={words.label} placeholder={words.label}
        onCommit={(label) => label.trim() && set({ label })} />
      <SymbolChoice label={words.icon ?? ""} value={button.symbol} layout={layout} none="link"
        onPick={(symbol) => set({ symbol })} />
      <Choice label={words.look ?? ""} value={button.look} options={choices.buttonLooks ?? []}
        onPick={(look) => set({ look })} />
      <Choice label={words.whenTapped ?? ""} value={button.action} options={choices.buttonKinds ?? []}
        onPick={(action) => set({ action })} />
      <CommitField value={button.template ?? ""} aria-label={field} placeholder={field} spellCheck={false}
        autoCapitalize="off" onCommit={(template) => set({ template })} />
      {button.action === "email" ? (
        <CommitField value={button.subject ?? ""} aria-label={words.subject}
          onCommit={(subject) => set({ subject })} />
      ) : null}
      {button.action === "email" || button.action === "message" ? (
        <CommitField multiline value={button.body ?? ""} aria-label={words.body}
          onCommit={(body) => set({ body })} />
      ) : null}
      <Check label={words.hidesButton ?? ""} isOn={button.hides} onChange={(on) => set({ hides: flag(on) })} />
    </div>
  );
}

/** The row of buttons under the header: on or off, in order, how they read, and custom ones. */
export function ActionsFields({ layout, send }: { layout: DetailsLayout; send: Send }) {
  const shared = useViewer((state) => state.words);
  const { words } = layout;
  const actions = layout.actions;
  if (layout.actions === undefined) return null;
  if (!actions) {
    return (
      <div className="layout-actions row" data-part="actions">
        <span className="words">{words.actions}</span>
        <button type="button" className="link" onClick={() => send({ details: "addActions" })}>
          {words.addActions}</button>
      </div>
    );
  }
  const placed = actions.items.filter((item) => item.isOn).length;
  const move = (id: string, to: number) => send({ details: "moveAction", item: id, to: String(to) });
  const look = (fields: Record<string, string>) => send({ details: "actionsLook", labels: actions.labels,
    highlight: flag(actions.highlightsFirst), ...fields });
  return (
    <div className="layout-actions" data-part="actions">
      <div className="row"><span className="words">{words.actions}</span></div>
      {actions.items.map((item, place) => (
        <div className="layout-block" key={item.id} data-action={item.id}>
          <div className="row">
            {item.button ? <span className="words">{item.name} <small>{item.note}</small></span> : (
              <Check label={item.name} isOn={item.isOn} onChange={(on) =>
                send({ details: "action", name: item.id, on: flag(on) })} />
            )}
            {item.isOn ? (
              <>
                <button type="button" aria-label={`${shared.moveUp} ${item.name}`} disabled={place === 0}
                  onClick={() => move(item.id, place - 1)}><Sym name="chevron.up" /></button>
                <button type="button" aria-label={`${shared.moveDown} ${item.name}`} disabled={place >= placed - 1}
                  onClick={() => move(item.id, place + 1)}><Sym name="chevron.down" /></button>
              </>
            ) : null}
            {item.button ? (
              <button type="button" aria-label={`${shared.remove} ${item.name}`}
                onClick={() => send({ details: "removeButton", button: item.id })}><Sym name="minus.circle" /></button>
            ) : null}
          </div>
          {item.button ? <ButtonFields button={item.button} place={{ button: item.id }} layout={layout}
            send={send} /> : null}
        </div>
      ))}
      <div className="block-fields">
        <button type="button" className="link" onClick={() => send({ details: "addButton" })}>{words.addButton}</button>
        <Choice label={words.buttonsShow ?? ""} value={actions.labels} options={layout.choices?.labels ?? []}
          onPick={(labels) => look({ labels })} />
        <Check label={words.highlight ?? ""} isOn={actions.highlightsFirst}
          onChange={(on) => look({ highlight: flag(on) })} />
        <button type="button" className="link" onClick={() => send({ details: "removeActions" })}>
          {words.removeActions}</button>
      </div>
    </div>
  );
}

/** A block's own settings beyond its words: by its kind, each sent with its place and handle. */
export function BlockSettingsFields({ block, place, layout, send }:
  { block: LayoutBlock; place: Place; layout: DetailsLayout; send: Send }) {
  const shared = useViewer((state) => state.words);
  const { words } = layout;
  const settings = block.settings;
  if (!settings) return null;
  const set = (fields: Record<string, string>) => send({ details: "blockSettings", ...place, ...fields });
  if (block.kind === "text") {
    return (
      <div className="block-fields">
        <Check label={words.textIcon ?? ""} isOn={settings.icon === true} onChange={(on) => set({ icon: flag(on) })} />
        <Check label={words.hidesText ?? ""} isOn={settings.hides !== false} onChange={(on) => set({ hides: flag(on) })} />
      </div>
    );
  }
  if (block.kind === "rows") {
    return (
      <div className="block-fields">
        {(settings.rows ?? []).map((row) => (
          <div className="row layout-row" key={row.index} data-row={row.index}>
            <CommitField value={row.title} aria-label={`${words.name} ${row.index + 1}`}
              onCommit={(title) => title.trim() && send({ details: "editRow", ...place, row: String(row.index),
                title, value: row.value })} />
            <CommitField value={row.value} aria-label={`${words.value} ${row.index + 1}`} spellCheck={false}
              onCommit={(value) => value.trim() && send({ details: "editRow", ...place, row: String(row.index),
                title: row.title, value })} />
            <button type="button" aria-label={`${shared.remove} ${row.title}`}
              onClick={() => send({ details: "removeRow", ...place, row: String(row.index) })}>
              <Sym name="minus.circle" /></button>
          </div>
        ))}
        <AddRow words={words} keys={layout.keys} onAdd={(title, value) => send({ details: "addRow", ...place,
          title, value })} />
        <Choice label={words.nameAndValue ?? ""} value={settings.look ?? "nameAboveValue"}
          options={layout.choices?.rowLooks ?? []} onPick={(look) => set({ look })} />
        <Check label={words.rowIcons ?? ""} isOn={settings.icons !== false} onChange={(on) => set({ icons: flag(on) })} />
        <Check label={words.hidesRows ?? ""} isOn={settings.hidesEmpty !== false}
          onChange={(on) => set({ hidesEmpty: flag(on) })} />
      </div>
    );
  }
  if (block.kind === "connectionCard") {
    return (
      <div className="block-fields">
        <small>{words.card}</small>
        {(layout.choices?.cardParts ?? []).map((part) => (
          <CommitField key={part.id} value={settings.card?.[part.id] ?? ""} aria-label={part.title}
            placeholder={`{${part.id}}`} spellCheck={false} autoCapitalize="off"
            onCommit={(line) => set({ [part.id]: line })} />
        ))}
        <CommitField type="number" min={0} max={3600} step={30} value={String(settings.live ?? 0)}
          aria-label={words.liveFor} onCommit={(live) => set({ live: String(Math.max(0, Number(live) || 0)) })} />
      </div>
    );
  }
  if (block.kind === "button" && settings.button) {
    return <ButtonFields button={settings.button} place={place} layout={layout} send={send} />;
  }
  return null;
}

function AddRow({ words, keys, onAdd }:
  { words: Record<string, string>; keys: string[]; onAdd: (title: string, value: string) => void }) {
  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const value = String(data.get("value") ?? "").trim();
    if (!title || !value) return;
    onAdd(title, value);
    form.reset();
  };
  return (
    <form className="row add-row" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
      <input name="title" aria-label={`${words.addRow} ${words.name}`} placeholder={words.name} />
      <input name="value" aria-label={`${words.addRow} ${words.value}`} placeholder={keys[0] ? `{${keys[0]}}` : ""}
        spellCheck={false} autoCapitalize="off" />
      <button type="submit">{words.addRow}</button>
    </form>
  );
}
