"use client";

import { useEffect, useState } from "react";
import { OFFERED_ROLES, isAddress } from "@/lib/people";
import type { SharePeople, SharePerson, ShareRole } from "@/lib/types";
import { filledIn } from "@/lib/words";
import { askPeople, inviteAnother, loadPeople, removePerson, usePeople } from "@/store/people";
import { copyText, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";

/** 59 Edit map's People card: the phone's share read and changed, one ask at a time. */
export function People() {
  const mapID = useViewer((state) => state.mapID);
  const people = usePeople((state) => (state.of?.kind === "map" && state.of.id === mapID ? state.people : null));
  useEffect(() => {
    if (mapID) void loadPeople({ kind: "map", id: mapID });
  }, [mapID]);
  return people ? <Roster people={people} /> : null;
}

export function Roster({ people }: { people: SharePeople }) {
  const words = useViewer((state) => state.words);
  const asking = usePeople((state) => state.asking);
  const isFolder = usePeople((state) => state.of?.kind === "folder");
  const [role, setRole] = useState<ShareRole>("reader");
  const offersShare = isFolder && people.mayInvite && (!people.isShared || people.addsMore === true);
  return (
    <>
      <div className="title-row">
        <h2 className="title">{isFolder ? words.folderSharing : words.people}</h2>
        {people.tally ? <span className="foot-note" id="peopleTally">{people.tally}</span> : null}
      </div>
      <div className="list" id="people">
        {people.heldBy ? <div className="foot-note" id="peopleHeldBy">{filledIn(words.heldBy, "name", people.heldBy)}</div>
          : null}
        {!people.heldBy && !people.isShared ? (
          <div className="row" id="peopleAlone">
            <div className="words">{isFolder ? words.folderAlone : words.aloneHeadline}
              {people.readOnly ? null : <small>{isFolder ? words.folderAdvice : words.aloneAdvice}</small>}</div>
          </div>
        ) : null}
        {people.folderLine ? <div className="foot-note" id="folderLine">{people.folderLine}</div> : null}
        {people.people.map((person) => <PersonRow key={person.id} person={person} readOnly={people.readOnly === true} />)}
      </div>
      {asking === "share" || (asking === "invite" && !people.isShared) ? (
        <div className="foot-note" id="peopleWorking">{words.askingLink}</div>
      ) : null}
      {offersShare ? (
        <button type="button" className="action" id="shareFolder" disabled={asking != null}
          onClick={() => void askPeople({ kind: "share" })}>
          <Sym name="person.badge.plus" />{people.isShared ? words.addRest : words.shareFolder}
        </button>
      ) : null}
      {people.mayInvite ? <Invite people={people} role={role} onRole={setRole} /> : null}
      {people.link || (people.readOnly && people.isShared) ? <LinkCard people={people} role={role} /> : null}
      {people.isShared && !people.heldBy ? (
        <div className="foot-note">{people.linkRole ? words.linkNote : words.sharedNote}</div>
      ) : null}
      {people.heldBy || !people.caveat ? null : <div className="foot-note" id="peopleCaveat">{people.caveat}</div>}
      {people.readOnly ? <div className="foot-note" id="peopleInApp">{words.peopleInApp}</div> : null}
    </>
  );
}

function PersonRow({ person, readOnly }: { person: SharePerson; readOnly: boolean }) {
  const words = useViewer((state) => state.words);
  const roleTitle = (role: ShareRole) => words[`role.${role}`] ?? role;
  return (
    <div className="row" data-person={person.id}>
      <div className="words">{person.name}<small>{person.line}</small></div>
      {person.mayChangeRole ? (
        <select aria-label={`${words.role} · ${person.name}`} value={person.role}
          onChange={(event) => void askPeople({ kind: "role", person: person.id, role: event.target.value as ShareRole })}>
          {OFFERED_ROLES.map((role) => <option key={role} value={role}>{roleTitle(role)}</option>)}
        </select>
      ) : !readOnly && person.role !== "owner" && person.hasAccepted ? <small>{roleTitle(person.role)}</small> : null}
      {person.mayRemove ? (
        <button type="button" className="icon-button danger" aria-label={filledIn(words.removePerson, "name", person.name)}
          title={filledIn(words.removePerson, "name", person.name)} onClick={() => removePerson(person.id, person.name)}>
          <Sym name="person.badge.minus" />
        </button>
      ) : null}
    </div>
  );
}

function Invite({ people, role, onRole }: { people: SharePeople; role: ShareRole; onRole: (role: ShareRole) => void }) {
  const words = useViewer((state) => state.words);
  const invited = usePeople((state) => state.invited);
  const asking = usePeople((state) => state.asking);
  const [address, setAddress] = useState("");
  const roleTitle = (each: ShareRole) => words[`role.${each}`] ?? each;
  if (invited) {
    return (
      <div className="card" id="peopleInvited">
        <div className="field"><label>{words.invited}</label>{invited} · {roleTitle(role)}</div>
        {people.link ? (
          <button type="button" className="action" id="copyInviteLink" onClick={() => void copyText(people.link ?? "")}>
            <Sym name="link" />{words.copyLink}
          </button>
        ) : <div className="foot-note">{words.ownerSends}</div>}
        <button type="button" className="text-button" id="inviteAnother"
          onClick={() => { setAddress(""); inviteAnother(); }}>{words.inviteElse}</button>
      </div>
    );
  }
  const invite = () => {
    if (isAddress(address)) void askPeople({ kind: "invite", address, role });
  };
  return (
    <div className="card" id="peopleInvite">
      <div className="field"><label>{people.invitesDirectly ? words.inviteSomeone : words.askToInvite}</label>
        <input type="text" value={address} placeholder={words.emailOrPhone} aria-label={words.emailOrPhone}
          inputMode="email" autoComplete="off" onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") invite(); }} /></div>
      <div className="field"><label>{words.newPeopleCan}</label>
        <select aria-label={words.newPeopleCan} value={role} onChange={(event) => onRole(event.target.value as ShareRole)}>
          {OFFERED_ROLES.map((each) => <option key={each} value={each}>{roleTitle(each)}</option>)}
        </select></div>
      <div className="foot-note">{`${words[`roleDetail.${role}`] ?? ""}. ${words.changeLater}`}</div>
      <div className="foot-note">{people.invitesDirectly ? words.theyGetMap : words.ownerSends}</div>
      <button type="button" className="action" id="inviteButton" disabled={!isAddress(address) || asking != null}
        onClick={invite}><Sym name="person.badge.plus" />{words.invite}</button>
    </div>
  );
}

function LinkCard({ people, role }: { people: SharePeople; role: ShareRole }) {
  const words = useViewer((state) => state.words);
  const link = people.link ?? "";
  const isOpen = people.linkRole != null;
  return (
    <>
      <h2 className="title">{words.linkTitle}</h2>
      <div className="list" id="peopleLink">
        <div className="row">
          <div className="words">{link ? <span className="link-text">{link}</span> : null}
            <small>{isOpen ? words.linkOpen : words.linkInvitedOnly}
              {people.readOnly && people.linkRole ? ` · ${words[`role.${people.linkRole}`]}` : ""}</small></div>
          {link ? (
            <button type="button" className="text-button" id="copyShareLink" onClick={() => void copyText(link)}>
              {words.copyLink}</button>
          ) : null}
        </div>
      </div>
      {people.mayChangeLink ? (
        <>
          <h2 className="title">{words.whoCanJoin}</h2>
          <div className="list" id="whoCanJoin" role="radiogroup" aria-label={words.whoCanJoin}>
            <JoinRow isOn={!isOpen} title={words.onlyInvited} note={words.onlyInvitedNote} value="invited"
              onPick={() => void askPeople({ kind: "link", role: null })} />
            <JoinRow isOn={isOpen} title={words.anyoneWithLink} note={words.anyoneWithLinkNote} value="anyone"
              onPick={() => void askPeople({ kind: "link", role })} />
          </div>
        </>
      ) : null}
    </>
  );
}

function JoinRow({ isOn, title, note, value, onPick }:
  { isOn: boolean; title: string; note: string; value: string; onPick: () => void }) {
  return (
    <label className="row" data-join={value}>
      <input type="radio" name="whoCanJoin" checked={isOn} onChange={() => { if (!isOn) onPick(); }} />
      <div className="words">{title}<small>{note}</small></div>
    </label>
  );
}
