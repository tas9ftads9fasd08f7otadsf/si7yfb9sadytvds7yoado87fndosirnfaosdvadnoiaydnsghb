"use client";

import { useEffect } from "react";
import { NEEDS_WORD, REFUSAL_ENGLISH, languagesOf, publishNeeds } from "@/lib/publish";
import { listed } from "@/lib/words";
import { addPublishLanguage, cancelPublish, donePublish, editPublish, loadPublish, removePublishLanguage, sendPublish,
  usePublish, writePublish } from "@/store/publish";
import { showEditTab, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";

/** The Gallery's sheet as Edit map draws it, under People: the form, the wait on the phone, then the three steps. */
export function Publish() {
  const mapID = useViewer((state) => state.mapID);
  const editable = useViewer((state) => state.editToken != null);
  const offer = usePublish((state) => state.offer);
  useEffect(() => {
    if (mapID && editable) void loadPublish(mapID);
  }, [mapID, editable]);
  if (!offer) return null;
  return <PublishCard />;
}

function Heading() {
  const words = useViewer((state) => state.words);
  const isUpdate = usePublish((state) => state.offer?.isUpdate);
  return (
    <div className="title-row">
      <h2 className="title" id="publishTitle">{isUpdate ? words.publishUpdate : words.publishTitle}</h2>
      <span className="foot-note">{words.publishSubtitle}</span>
    </div>
  );
}

function PublishCard() {
  const step = usePublish((state) => state.step);
  return (
    <div id="publish">
      <Heading />
      {step === "waiting" ? <Waiting /> : step === "sent" ? <Sent /> : step === "failed" ? <Failed /> : <Form />}
    </div>
  );
}

function Said() {
  const said = usePublish((state) => state.said);
  return said ? <div className="foot-note warning" role="alert" id="publishSaid">{said}</div> : null;
}

function Form() {
  const words = useViewer((state) => state.words);
  const offer = usePublish((state) => state.offer)!;
  const form = usePublish((state) => state.form);
  const step = usePublish((state) => state.step);
  if (!form) return null;
  const refusal = offer.refusal;
  if (refusal) {
    const key = NEEDS_WORD[refusal];
    return (
      <div className="list" id="publishRefused">
        <div className="row"><div className="words">{key ? words[key] : REFUSAL_ENGLISH[refusal]}</div></div>
      </div>
    );
  }
  const needs = publishNeeds(form, offer);
  const sending = step === "sending";
  const languageName = (code: string) => words[`language.${code}`] ?? code;
  const written = languagesOf(form, offer, languageName);
  const free = listed(words.languages).filter((code) => !written.includes(code))
    .sort((one, other) => languageName(one).localeCompare(languageName(other)));
  const shown = written.includes(form.shown) ? form.shown : offer.language;
  const isMain = shown === offer.language;
  const text = form.texts[shown] ?? { title: "", body: "" };
  const mainName = form.texts[offer.language]?.title.trim();
  return (
    <>
      <Said />
      <div className="card publish-map">
        <div className="field">
          <b id="publishTile">{(text.title.trim() || mainName) ?? ""}</b>
          <span className="promise"><Sym name="checkmark.circle" />{words.publishSendsLayers}</span>
          <span className="promise"><Sym name="lock" />{words.publishKeepsData}</span>
        </div>
      </div>
      {offer.isUpdate ? (
        <>
          <h3 className="title">{words.publishChanged}</h3>
          <div className="card"><div className="field">
            <textarea id="publishChanges" rows={3} value={form.changes} aria-label={words.publishChanged}
              onChange={(event) => editPublish({ changes: event.target.value })} />
          </div></div>
          <div className="foot-note">{words.publishChangesNote}</div>
        </>
      ) : null}
      {offer.categories.length ? (
        <>
          <div className="title-row">
            <h3 className="title">{words.publishCategory}</h3>
            {form.category ? null : <span className="foot-note required">{words.publishRequired}</span>}
          </div>
          <div className="category-tiles" id="publishCategories" role="group" aria-label={words.publishCategory}>
            {offer.categories.map((category) => (
              <button type="button" key={category.id} id={`publishCategory-${category.id}`}
                aria-pressed={form.category === category.id} className={form.category === category.id ? "picked" : undefined}
                onClick={() => editPublish({ category: form.category === category.id ? null : category.id })}>
                <Sym name={category.symbol} />{category.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="title-row">
        <h3 className="title">{words.publishNameAndText}</h3>
        <span className="foot-note">{written.length}</span>
      </div>
      <div className="language-chips">
        <div className="chips" role="group" aria-label={words.publishNameAndText}>
          {written.map((code) => (
            <button type="button" key={code} id={`publishLanguage-${code}`} aria-pressed={code === shown}
              className={code === shown ? "picked" : undefined} onClick={() => editPublish({ shown: code })}>
              {form.texts[code]?.title.trim() ? "✓ " : ""}{languageName(code)}
              {code === offer.language ? ` · ${words.publishAppLanguage}` : ""}
            </button>
          ))}
          {free.length ? (
            <select id="publishAddLanguage" aria-label={words.publishAddLanguage} value=""
              onChange={(event) => addPublishLanguage(event.target.value)}>
              <option value="">{words.publishAddLanguage}</option>
              {free.map((code) => <option key={code} value={code}>{languageName(code)}</option>)}
            </select>
          ) : null}
        </div>
      </div>
      <div className="card"><div className="field" data-language={shown}>
        <input type="text" id="publishName" value={text.title} placeholder={words.publishNameHint}
          aria-label={`${words.publishNameHint} · ${languageName(shown)}`} maxLength={200}
          onChange={(event) => writePublish(shown, "title", event.target.value)} />
        <textarea id="publishSummary" rows={4} value={text.body} placeholder={words.publishTextHint}
          aria-label={`${words.publishTextHint} · ${languageName(shown)}`} maxLength={2000}
          onChange={(event) => writePublish(shown, "body", event.target.value)} />
        {isMain ? null : (
          <button type="button" className="text-link danger" id="publishRemoveLanguage"
            onClick={() => removePublishLanguage(shown)}>{words.remove}</button>
        )}
      </div></div>
      <h3 className="title">{words.publishCovers}</h3>
      <div className="list" id="publishCoverage">
        <div className="row">
          <div className="words">{offer.coverageLine}
            {offer.coverage ? <small>{words.publishFoundCoverage}</small> : null}</div>
          <button type="button" className="pill" id="publishChange" onClick={() => showEditTab("offline")}>
            {words.publishChange}
          </button>
        </div>
        {offer.places.length > 1 ? (
          <div className="chips places">{offer.places.map((place) => <span key={place}>{place}</span>)}</div>
        ) : null}
      </div>
      {offer.leftOut.length ? (
        <>
          <h3 className="title">{words.publishLeftOut}</h3>
          <div className="list" id="publishLeftOut">
            {offer.leftOut.map((each) => <div className="row" key={each}><div className="words">{each}</div></div>)}
          </div>
        </>
      ) : null}
      <div className="title-row">
        <h3 className="title">{words.publishKeysHeader}</h3>
        <span className="foot-note">{offer.leftOut.length ? words.publishRequired : words.publishOptional}</span>
      </div>
      <div className="card"><div className="field">
        <textarea id="publishKeysNote" rows={3} value={form.keysNote} placeholder={words.publishKeysExample}
          aria-label={words.publishKeysHeader} onChange={(event) => editPublish({ keysNote: event.target.value })} />
        <input type="url" id="publishManual" value={form.manualURL} placeholder={words.publishManualHint}
          aria-label={words.publishManualHint} autoComplete="off" spellCheck={false}
          onChange={(event) => editPublish({ manualURL: event.target.value })} />
      </div></div>
      {offer.isUpdate ? null : (
        <div className="card publish-replaces" id="publishReplaces">
          <div className="field">
            <b>{words.publishReplacesTitle}</b>
            <span>{words.publishReplacesText}</span>
            <button type="button" role="checkbox" aria-checked={form.replaces} id="publishAgree" className="text-link"
              onClick={() => editPublish({ replaces: !form.replaces })}>
              <Sym name={form.replaces ? "checkmark.circle.fill" : "circle"} />{words.publishAgree}
            </button>
          </div>
        </div>
      )}
      {offer.needsPublicName ? (
        <div className="card"><div className="field">
          <label htmlFor="publishPublicName">{words.publishPublicName}</label>
          <input type="text" id="publishPublicName" value={form.publicName} maxLength={80} autoComplete="off"
            onChange={(event) => editPublish({ publicName: event.target.value })} />
        </div></div>
      ) : null}
      <button type="button" className="action" id="publishSend" disabled={needs != null || sending}
        onClick={() => void sendPublish()}>
        <Sym name="paperplane" />
        {sending ? words.publishSending : needs ? words[NEEDS_WORD[needs] ?? "publishTitle"]
          : offer.isUpdate ? words.publishUpdate : words.publishTitle}
      </button>
      <div className="foot-note">{words.publishFooter}</div>
    </>
  );
}

/** The code is shown here and on the phone, so its person says yes to this browser. */
function Waiting() {
  const words = useViewer((state) => state.words);
  const started = usePublish((state) => state.started);
  return (
    <div className="card publish-waiting" id="publishWaiting">
      <div className="field">
        <span className="pill" id="publishBadge">{words.publishBadgeWaiting}</span>
        <b className="code" id="publishCode" aria-live="polite">{started?.code}</b>
        <span>{words.confirmOnPhone}</span>
        <button type="button" className="text-link danger" id="publishCancel"
          onClick={() => void cancelPublish()}>{words.cancel}</button>
      </div>
    </div>
  );
}

function Step({ n, title, detail, badge }: { n: number; title: string; detail: string; badge: string }) {
  return (
    <div className="row" data-step={n}>
      <span className="tile">{n}</span>
      <div className="words">{title}<small>{detail}</small></div>
      <span className="pill">{badge}</span>
    </div>
  );
}

function Sent() {
  const words = useViewer((state) => state.words);
  const sentAt = usePublish((state) => state.sentAt);
  const name = usePublish((state) => state.form?.texts[state.offer?.language ?? ""]?.title);
  const at = sentAt ? new Date(sentAt).toLocaleTimeString(undefined, { timeStyle: "short" }) : "";
  return (
    <>
      <div className="foot-note" id="publishSent"><b>{words.publishSent}</b> {name}</div>
      <div className="list" id="publishSteps">
        <Step n={1} title={words.publishStepSent} detail={at} badge={words.done} />
        <Step n={2} title={words.publishStepReview} detail={words.publishStepWithin} badge={words.publishBadgeWaiting} />
        <Step n={3} title={words.publishStepLive} detail={words.publishStepTell} badge={words.publishBadgeNext} />
      </div>
      <button type="button" className="action" id="publishDone" onClick={donePublish}>{words.done}</button>
    </>
  );
}

function Failed() {
  const words = useViewer((state) => state.words);
  return (
    <>
      <Said />
      <button type="button" className="action" id="publishDone" onClick={donePublish}>{words.done}</button>
    </>
  );
}
