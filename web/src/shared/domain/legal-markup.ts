// What is pasted in a legal text keeps its bold, as the marks the flyer understands. The HTML of the
// clipboard comes from outside (a mail, a web): a parsed document is inert, where a div with
// innerHTML would run an <img onerror> even out of the page.
const BLOCK = /^(p|div|li|tr|h[1-6])$/;
const BOLD_FROM = 600;
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function isBoldElement(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === "b" || tag === "strong") return true;
  const { fontWeight } = element.style;
  return (
    fontWeight === "bold" || fontWeight === "bolder" || Number.parseInt(fontWeight, 10) >= BOLD_FROM
  );
}

function isHtmlElement(node: Node): node is HTMLElement {
  return node.nodeType === ELEMENT_NODE;
}

function textOfNode(node: Node, bold: boolean): string {
  if (node.nodeType === TEXT_NODE) {
    const text = (node.nodeValue ?? "").replaceAll(/[ \t\r\n]+/g, " ");
    return bold && text.trim() ? `**${text}**` : text;
  }
  if (!isHtmlElement(node)) return "";
  const inside = walk(node, bold || isBoldElement(node));
  const tag = node.tagName.toLowerCase();
  return tag === "br" || BLOCK.test(tag) ? `${inside}\n` : inside;
}

function walk(parent: Node, bold: boolean): string {
  return Array.from(parent.childNodes, (child) => textOfNode(child, bold)).join("");
}

/** The bold of the source, as **marks**. Scripts and images are left out. */
export function htmlBoldToMarks(html: string): string {
  const { body } = new DOMParser().parseFromString(html, "text/html");
  return (
    walk(body, false)
      // Bold next to bold is one: **a** **b** is **a b**.
      .replaceAll(/\*\*\s*\*\*/g, " ")
      .replaceAll(/[ \t]+\n/g, "\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .replaceAll(/[ \t]{2,}/g, " ")
      .trim()
  );
}
