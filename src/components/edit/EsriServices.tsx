"use client";

import { useEffect } from "react";
import type { EsriService } from "@/lib/types";
import { changeEsri, loadEsri, openEsri, pickStyle, useViewer } from "@/store/viewer";
import { Switch } from "../ui/Switch";
import { Sym } from "../ui/Sym";

/** 67 Edit map's Esri services: each opens its page, where its layers are ticked as on the phone. */
export function EsriServices() {
  const words = useViewer((state) => state.words);
  const esri = useViewer((state) => state.esri);
  const open = useViewer((state) => state.esriOpen);
  const mapID = useViewer((state) => state.mapID);
  const layerCount = useViewer((state) => state.portable?.stack?.length);
  useEffect(() => {
    void loadEsri();
  }, [mapID, layerCount]);
  if (!esri?.services.length) return null;
  return (
    <>
      <h2 className="title">{words.esriServices}</h2>
      <div className="list" id="esriServices">
        {esri.services.map((service) => (
          <button type="button" className="row" key={service.id} data-service={service.id}
            aria-expanded={open === service.id} onClick={() => openEsri(open === service.id ? null : service.id)}>
            <Sym name="globe" />
            <div className="words">{service.name}<small>{service.detail}</small></div>
            <Sym name={open === service.id ? "chevron.down" : "chevron.right"} />
          </button>
        ))}
      </div>
      {esri.services.filter((service) => service.id === open).map((service) => (
        <ServicePage service={service} key={service.id} />
      ))}
    </>
  );
}

function ServicePage({ service }: { service: EsriService }) {
  const words = useViewer((state) => state.words);
  const styleID = useViewer((state) => state.styleID);
  return (
    <div className="card" id="esriServicePage">
      <h3 className="title">{service.name}<small className="foot-note">{service.subtitle}</small></h3>
      <div className="list">
        <div className="row"><div className="words">{words.esriAddress}<small>{service.url}</small></div></div>
        <div className="row"><div className="words">{words.takenAs}<small>{service.take}</small></div></div>
        <button type="button" className="row add" id="readEsriAgain"
          onClick={() => void changeEsri(service.id, { kind: "read" })}>
          <Sym name="arrow.clockwise" />{service.readAgain}
        </button>
        {service.style && service.style !== styleID ? (
          <button type="button" className="row add" id="esriServiceStyle" onClick={() => pickStyle(service.style ?? null)}>
            <Sym name="square.3.layers.3d" />{service.name}
          </button>
        ) : null}
      </div>
      <h3 className="title">{words.layers}</h3>
      <div className="list" id="esriServiceLayers">
        {service.layers.length === 0 ? <div className="row dimmed">{words.noLayerList}</div> : null}
        {service.layers.map((layer) => (
          <div className="row" key={layer.id} data-esri-layer={layer.id} data-locked={layer.refusal ? "" : undefined}>
            <Sym name={layer.symbol} />
            <div className="words">{layer.name}<small>{layer.subtitle}</small></div>
            <Switch isOn={layer.layer != null} isLocked={layer.refusal != null}
              label={words.drawOnMap.replace("{name}", layer.name)}
              onChange={(drawn) => void changeEsri(service.id, { kind: drawn ? "add" : "remove", layer: layer.id })} />
          </div>
        ))}
      </div>
      <div className="foot-note">{service.footnote}</div>
      <button type="button" className="action" id="forgetEsriService"
        onClick={() => void changeEsri(service.id, { kind: "forget" })}>
        <Sym name="trash" />{words.forgetService}
      </button>
    </div>
  );
}
