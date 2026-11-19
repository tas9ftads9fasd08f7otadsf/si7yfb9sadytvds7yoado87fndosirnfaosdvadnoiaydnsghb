import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharePeople } from "@/lib/types";
import { resetPeople } from "@/store/people";
import { resetViewer, useViewer } from "@/store/viewer";
import { FolderPeople, FolderShareButton } from "./FolderSharing";

const alone: SharePeople = { isShared: false, role: "owner", mayInvite: true, invitesDirectly: true, tally: "",
  link: null, linkRole: null, mayChangeLink: false, heldBy: null, caveat: "", people: [],
  folderLine: "2 maps would travel in this share", addsMore: false };

function Folder() {
  return <><FolderShareButton id="F" name="Hills" /><FolderPeople id="F" /></>;
}

describe("FolderSharing", () => {
  beforeEach(() => {
    resetViewer();
    resetPeople();
    useViewer.setState({ editToken: "t" });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 68 the folder's button reads its people at the folder and opens its sharing under the row
  it("opens a folder's sharing, offers to share it, and closes", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(alone)));
    vi.stubGlobal("fetch", fetcher);
    render(<Folder />);
    fireEvent.click(screen.getByRole("button", { name: "Sharing a folder · Hills" }));
    await screen.findByText("This folder is yours alone.");
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe("/riki/v1/folders/F/people");
    expect(screen.getByText("2 maps would travel in this share")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Share this folder/ }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect((fetcher.mock.calls[1] as unknown as [string])[0]).toBe("/riki/v1/folders/F/people?share=1");
    fireEvent.click(screen.getByRole("button", { name: "Sharing a folder · Hills" }));
    expect(screen.queryByText("This folder is yours alone.")).toBeNull();
  });

  // 68 a shared folder with maps added since offers to add the rest, and lists no link choice
  it("offers the rest to a shared folder and no link choice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...alone, isShared: true, addsMore: true,
      link: "https://www.icloud.com/share/0f" }))));
    render(<Folder />);
    fireEvent.click(screen.getByRole("button", { name: "Sharing a folder · Hills" }));
    await screen.findByRole("button", { name: /Add the rest to this share/ });
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
