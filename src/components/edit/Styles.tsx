"use client";

import type { Portable } from "@/lib/types";
import { change, pickStyle, useViewer } from "@/store/viewer";
import { CommitField } from "../ui/CommitField";
import { Sym } from "../ui/Sym";

export function Styles({ portable }: { portable: Portable }) {
  const words = useViewer((state) => state.words);
  const styleID = useViewer((state) => state.styleID);
  const styles = portable.styles ?? [];
  return (
    <>
      <h2 className="title">{words.styles}</h2>
      <div className="list">
        {styles.map((style) => (
          <div className="row" key={style.id}>
            <button type="button" className="icon-button" aria-label={style.name} onClick={() => pickStyle(style.id)}>
              <Sym name={style.id === styleID ? "checkmark.circle.fill" : "circle"} />
            </button>
            <div className="words">
              <CommitField type="text" value={style.name} aria-label={words.rename}
                onCommit={(name) => change({ style: style.id, name })} />
            </div>
            <button type="button" className="icon-button danger" aria-label={words.delete} title={words.delete}
              disabled={styles.length < 2} onClick={() => change({ removeStyle: style.id })}><Sym name="trash" /></button>
          </div>
        ))}
        <button type="button" className="row add" onClick={() => change({ addStyle: `${words.newStyle} ${styles.length + 1}` })}>
          <Sym name="plus.circle.fill" />{words.newStyle}
        </button>
      </div>
    </>
  );
}
