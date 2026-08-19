import {
  SpeechInterpretationFailure,
  interpretTranscript,
  type DocumentRewritePort,
  type InterpretTranscriptInput,
  type InterpretTranscriptPorts,
  type SpeechInterpretationOutcome,
} from "@app/speech-command";
import type { MarkdownRewriteProviderPort } from "@app/speech-command/openrouter";
import {
  createTiptapMarkdownCodec,
  type TiptapMarkdownCodec,
} from "@app/editor";
import { Effect } from "effect";

const MaximumMarkdownBytes = 16_000;
const MaximumDocumentNodes = 1_000;
const MaximumDocumentDepth = 16;
const PreviewLength = 180;

export type SpeechInterpretationService = Readonly<{
  interpret: (
    input: InterpretTranscriptInput,
  ) => Effect.Effect<SpeechInterpretationOutcome>;
}>;

export function makeSpeechInterpretationService(
  ports: InterpretTranscriptPorts,
): SpeechInterpretationService {
  return {
    interpret: (input) => interpretTranscript(input, ports),
  };
}

function excerpt(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= PreviewLength
    ? normalized
    : `${normalized.slice(0, PreviewLength - 1)}…`;
}

export function makeTiptapDocumentRewritePort(
  provider: MarkdownRewriteProviderPort,
  codec: TiptapMarkdownCodec = createTiptapMarkdownCodec(),
): DocumentRewritePort {
  return {
    rewrite: (request) =>
      Effect.try({
        try: () => ({
          sourceMarkdown: codec.serialize(request.documentContent),
          before: codec.inspect(request.documentContent),
        }),
        catch: () =>
          SpeechInterpretationFailure.InvalidContext(
            "The captured document is not valid for the configured editor schema.",
          ),
      }).pipe(
        Effect.flatMap(({ sourceMarkdown, before }) =>
          provider.rewrite({
            instruction: request.instruction,
            sourceMarkdown,
            maximumOutputLength: request.maximumOutputLength,
          }).pipe(
            Effect.flatMap((replacementMarkdown) =>
              Effect.try({
                try: () => {
                  const markdown = replacementMarkdown.trim();
                  if (
                    markdown.length === 0 ||
                    markdown.length > request.maximumOutputLength ||
                    new TextEncoder().encode(markdown).byteLength > MaximumMarkdownBytes
                  ) {
                    throw new Error("Markdown is empty or oversized.");
                  }
                  const replacementContent = codec.parse(markdown);
                  const after = codec.inspect(replacementContent);
                  if (
                    after.nodeCount > MaximumDocumentNodes ||
                    after.maximumDepth > MaximumDocumentDepth
                  ) {
                    throw new Error("Parsed document exceeds structural limits.");
                  }
                  return {
                    replacementContent,
                    preview: {
                      beforeExcerpt: excerpt(before.text),
                      afterExcerpt: excerpt(after.text),
                      beforeWordCount: before.wordCount,
                      afterWordCount: after.wordCount,
                      beforeBlockCount: before.blockCount,
                      afterBlockCount: after.blockCount,
                    },
                  };
                },
                catch: () =>
                  SpeechInterpretationFailure.RewriteFailed(
                    "The Markdown rewrite could not be validated against the editor schema and safety limits.",
                  ),
              }),
            ),
          ),
        ),
      ),
  };
}
