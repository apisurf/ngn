// Markdown a person wrote about a task, drawn as a readable page.
//
// react-markdown builds React elements and never injects raw HTML, so a
// description is text and formatting, never markup or script. GFM adds the
// tables, task lists and strikethrough people expect from a README.
//
// Links leave the app: a description lives in someone's project, not here.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { css } from "styled-system/css";

const prose = css({
  maxW: "760px",
  fontSize: "14px",
  lineHeight: "1.65",
  color: "fg",
  overflowWrap: "anywhere",
  "& > :first-child": { mt: "0" },
  "& > :last-child": { mb: "0" },
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    fontWeight: "600",
    lineHeight: "1.3",
    mt: "6",
    mb: "2",
  },
  "& h1": { fontSize: "22px" },
  "& h2": { fontSize: "18px", pb: "1.5", borderBottom: "1px solid", borderColor: "line" },
  "& h3": { fontSize: "15px" },
  "& h4, & h5, & h6": { fontSize: "14px" },
  "& p, & ul, & ol, & pre, & table, & blockquote": { my: "3" },
  "& ul, & ol": { pl: "6" },
  "& ul": { listStyle: "disc" },
  "& ol": { listStyle: "decimal" },
  "& li + li": { mt: "1" },
  "& li > ul, & li > ol": { my: "1" },
  "& li:has(> input[type=checkbox])": { listStyle: "none", ml: "-5" },
  "& input[type=checkbox]": { mr: "1.5", verticalAlign: "middle" },
  "& a": { color: "accent", textDecoration: "none", _hover: { textDecoration: "underline" } },
  "& code": {
    fontFamily: "mono",
    fontSize: "12.5px",
    bg: "well",
    border: "1px solid",
    borderColor: "line",
    rounded: "sm",
    px: "1",
  },
  "& pre": {
    fontFamily: "mono",
    fontSize: "12.5px",
    lineHeight: "1.55",
    bg: "well",
    border: "1px solid",
    borderColor: "line",
    rounded: "md",
    px: "3",
    py: "2.5",
    overflowX: "auto",
  },
  "& pre code": { bg: "transparent", border: "none", p: "0", fontSize: "inherit" },
  "& blockquote": { pl: "3", borderLeft: "3px solid", borderColor: "lineStrong", color: "muted" },
  "& hr": { border: "none", borderTop: "1px solid", borderColor: "line", my: "5" },
  "& table": { borderCollapse: "collapse", display: "block", overflowX: "auto" },
  "& th, & td": { border: "1px solid", borderColor: "line", px: "2.5", py: "1.5" },
  "& th": { fontWeight: "600", bg: "well", textAlign: "left" },
  "& img": { maxW: "full" },
});

export function Markdown({ children }: { children: string }) {
  return (
    <div className={prose}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
