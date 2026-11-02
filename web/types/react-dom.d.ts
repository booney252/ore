// The site only uses this one hook from react-dom; @types/react-dom isn't installed.
declare module "react-dom" {
  export function useFormStatus(): { pending: boolean; data: FormData | null; method: string | null; action: unknown };
}
