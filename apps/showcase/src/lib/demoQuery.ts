export type DemoQuery = {
  embed: boolean;
  autorun: boolean;
  preset?: string;
};

export function readDemoQuery(search: string): DemoQuery {
  const qs = new URLSearchParams(search);
  return {
    embed: qs.get('embed') === '1',
    autorun: qs.get('autorun') === '1',
    preset: qs.get('preset') ?? undefined,
  };
}
