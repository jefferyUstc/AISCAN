import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MarkdownMessage from "./MarkdownMessage.jsx";

describe("MarkdownMessage", () => {
  it("renders markdown content", () => {
    render(<MarkdownMessage content={"# Title\n\nsome **bold** text"} />);
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("neutralizes unsafe link protocols", () => {
    const { container } = render(<MarkdownMessage content={"[click](javascript:alert(1))"} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector(".markdown-link-invalid")).not.toBeNull();
  });

  it("renders safe external links with rel/target", () => {
    const { container } = render(<MarkdownMessage content={"[site](https://example.com)"} />);
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute("href")).toBe("https://example.com");
    expect(anchor.getAttribute("rel")).toContain("noopener");
    expect(anchor.getAttribute("target")).toBe("_blank");
  });
});
