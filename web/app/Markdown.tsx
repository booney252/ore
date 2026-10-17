import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ text }: { text: string }) {
  return (
    <article className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
          table: (props) => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
        }}
      >
        {text.replace(/<!--[\s\S]*?-->/g, "")}
      </ReactMarkdown>
    </article>
  );
}
