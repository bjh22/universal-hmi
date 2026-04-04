/**
 * RFC 4180-compliant CSV parser.
 *
 * Handles quoted fields (with commas, newlines, and escaped quotes inside).
 * Returns a 2D array of strings — rows × columns.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    if (text[i] === '"') {
      // Quoted field — consume until closing quote
      i++; // skip opening quote
      let field = '';
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            // Escaped quote ""
            field += '"';
            i += 2;
          } else {
            // Closing quote
            i++; // skip closing quote
            break;
          }
        } else {
          field += text[i];
          i++;
        }
      }
      row.push(field);
      // After closing quote, expect comma, newline, or EOF
      if (i < len && text[i] === ',') {
        i++;
      } else if (i < len && (text[i] === '\r' || text[i] === '\n')) {
        if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i++;
        i++;
        rows.push(row);
        row = [];
      }
    } else if (text[i] === ',' ) {
      // Empty field before comma
      row.push('');
      i++;
    } else if (text[i] === '\r' || text[i] === '\n') {
      // End of row
      if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i++;
      i++;
      rows.push(row);
      row = [];
    } else {
      // Unquoted field
      let field = '';
      while (i < len && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
        field += text[i];
        i++;
      }
      row.push(field);
      if (i < len && text[i] === ',') {
        i++;
      } else if (i < len && (text[i] === '\r' || text[i] === '\n')) {
        if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i++;
        i++;
        rows.push(row);
        row = [];
      }
    }
  }

  // Push last row if it has content
  if (row.length > 0) {
    rows.push(row);
  }

  // Filter out empty trailing rows
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  return rows;
}
