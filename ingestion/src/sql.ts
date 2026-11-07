export function quoteSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
