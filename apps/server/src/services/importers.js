import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';

import { adminDb } from '../supabase.js';
import { cleanText, excelDate, numberOr, fetchAll } from '../utils/helpers.js';

const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.csv']);

export function isSupportedSpreadsheetName(fileName = '') {
  return SUPPORTED_EXTENSIONS.has(
    path.extname(String(fileName)).toLowerCase()
  );
}

function safeSheetName(originalName, index, usedNames) {
  let name = String(
    originalName || `Sheet${index + 1}`
  )
    .replace(/[\\/*?:\[\]]/g, '_')
    .trim();

  if (!name) {
    name = `Sheet${index + 1}`;
  }

  name = name.substring(0, 31);

  let finalName = name;
  let counter = 1;

  while (
    usedNames.has(
      finalName.toLowerCase()
    )
  ) {
    const suffix = `_${counter}`;

    finalName =
      name.substring(
        0,
        31 - suffix.length
      ) + suffix;

    counter++;
  }

  usedNames.add(
    finalName.toLowerCase()
  );

  return finalName;
}

async function loadSpreadsheet(
  buffer,
  fileName = ''
) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0
  ) {
    const error =
      new Error(
        'The uploaded spreadsheet is empty.'
      );

    error.status = 400;
    throw error;
  }

  const extension =
    path.extname(
      String(fileName)
    ).toLowerCase();

  if (extension === '.xls') {
    const error =
      new Error(
        'Old .xls files are not supported. Save the file as .xlsx first.'
      );

    error.status = 415;
    throw error;
  }

  if (
    extension &&
    !SUPPORTED_EXTENSIONS.has(
      extension
    )
  ) {
    const error =
      new Error(
        'Unsupported spreadsheet format. Upload an .xlsx, .xlsm, or .csv file.'
      );

    error.status = 415;
    throw error;
  }

  try {
    let sourceWorkbook;

    if (extension === '.csv') {
      sourceWorkbook =
        XLSX.read(
          buffer.toString('utf8'),
          {
            type: 'string',
            raw: true,
            cellDates: true
          }
        );
    } else {
      sourceWorkbook =
        XLSX.read(
          buffer,
          {
            type: 'buffer',
            raw: true,
            cellDates: true,
            cellFormula: true,
            cellNF: false,
            cellText: false
          }
        );
    }

    if (
      !sourceWorkbook?.SheetNames?.length
    ) {
      throw new Error(
        'The spreadsheet does not contain any readable worksheets.'
      );
    }

    const workbook =
      new ExcelJS.Workbook();

    const usedNames =
      new Set();

    sourceWorkbook.SheetNames.forEach(
      (
        originalSheetName,
        index
      ) => {
        const sourceSheet =
          sourceWorkbook.Sheets[
            originalSheetName
          ];

        if (!sourceSheet) {
          return;
        }

        const rows =
          XLSX.utils.sheet_to_json(
            sourceSheet,
            {
              header: 1,
              defval: null,
              raw: true,
              blankrows: true
            }
          );

        const worksheet =
          workbook.addWorksheet(
            safeSheetName(
              originalSheetName,
              index,
              usedNames
            )
          );

        for (
          const rowValues of rows
        ) {
          worksheet.addRow(
            Array.isArray(
              rowValues
            )
              ? rowValues
              : []
          );
        }
      }
    );

    if (
      !workbook.worksheets.length
    ) {
      throw new Error(
        'No readable worksheets were found in the spreadsheet.'
      );
    }

    console.log(
      'SPREADSHEET LOADED:',
      {
        fileName,
        sheets:
          workbook.worksheets.map(
            sheet => sheet.name
          )
      }
    );

    return workbook;

  } catch (originalError) {
    console.error(
      'SPREADSHEET LOAD ERROR:',
      originalError
    );

    const error =
      new Error(
        `Unable to read spreadsheet: ${
          originalError?.message ||
          'Unknown spreadsheet error.'
        }`
      );

    error.status = 422;

    throw error;
  }
}

function cellValue(cell) {
  const value =
    cell?.value;

  if (
    value &&
    typeof value === 'object'
  ) {
    if (
      'result' in value
    ) {
      return value.result;
    }

    if (
      'text' in value
    ) {
      return value.text;
    }

    if (
      'richText' in value
    ) {
      return value.richText
        .map(
          item => item.text
        )
        .join('');
    }
  }

  return value;
}

function normalizedHeader(value) {
  return String(
    value ?? ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function headerValues(
  worksheet,
  rowNumber
) {
  const values = [];

  worksheet
    .getRow(rowNumber)
    .eachCell(
      {
        includeEmpty: true
      },
      (
        cell,
        column
      ) => {
        values[column] =
          normalizedHeader(
            cellValue(cell)
          );
      }
    );

  return values;
}

function headerMap(worksheet) {
  for (
    let rowNumber = 1;
    rowNumber <=
    Math.min(
      worksheet.rowCount,
      30
    );
    rowNumber++
  ) {
    const values =
      headerValues(
        worksheet,
        rowNumber
      );

    const hasPart =
      values.some(
        value =>
          [
            'part number',
            'part no',
            'part no.',
            'part #',
            'part#',
            'partnumber',
            'sku',
            'product code'
          ].includes(value) ||
          value.includes(
            'part number'
          )
      );

    const hasDescription =
      values.some(
        value =>
          value ===
            'description' ||
          value ===
            'item description' ||
          value ===
            'product description' ||
          value.includes(
            'description'
          )
      );

    const hasQuantity =
      values.some(
        value =>
          [
            'quantity',
            'qty',
            'stock',
            'current stock',
            'stock quantity',
            'on hand',
            'on-hand'
          ].includes(value) ||
          value.includes(
            'quantity'
          )
      );

    if (
      (hasPart ||
        hasDescription) &&
      hasQuantity
    ) {
      const map = {};

      values.forEach(
        (
          value,
          column
        ) => {
          if (!value) {
            return;
          }

          if (
            value.includes(
              'part number'
            ) ||
            [
              'part no',
              'part no.',
              'part #',
              'part#',
              'partnumber',
              'sku',
              'product code'
            ].includes(value)
          ) {
            map.partNumber =
              column;
          }

          else if (
            value.includes(
              'sub number'
            ) ||
            value.includes(
              'sub no'
            ) ||
            value === 'sub' ||
            value === 'sub#' ||
            value === 'sub #'
          ) {
            map.subNumber =
              column;
          }

          else if (
            value.includes(
              'description'
            )
          ) {
            map.description =
              column;
          }

          else if (
            value === 'brand' ||
            value.includes(
              'brand'
            )
          ) {
            map.brand =
              column;
          }

          else if (
            [
              'quantity',
              'qty',
              'stock',
              'current stock',
              'stock quantity',
              'on hand',
              'on-hand'
            ].includes(value) ||
            value.includes(
              'quantity'
            )
          ) {
            map.quantity =
              column;
          }

          else if (
            value.includes(
              'unit cost'
            ) ||
            value.includes(
              'unit  cost'
            ) ||
            value.includes(
              'u. cost'
            ) ||
            value === 'cost'
          ) {
            map.unitCost =
              column;
          }

          else if (
            value === 'price' ||
            value.includes(
              'selling price'
            ) ||
            value.includes(
              'sale price'
            )
          ) {
            map.price =
              column;
          }

          else if (
            value.includes(
              'reference'
            ) ||
            [
              'ref #',
              'ref no',
              'reference no'
            ].includes(value)
          ) {
            map.reference =
              column;
          }

          else if (
            value === 'date' ||
            value.includes(
              'purchase date'
            ) ||
            value.includes(
              'received date'
            )
          ) {
            map.date =
              column;
          }

          else if (
            value.includes(
              'supplier'
            )
          ) {
            map.supplier =
              column;
          }

          else if (
            value.includes(
              'notes'
            ) ||
            value.includes(
              'remarks'
            )
          ) {
            map.notes =
              column;
          }

          else if (
            value === 'unit' ||
            value === 'uom'
          ) {
            map.unit =
              column;
          }

          else if (
            value ===
              'location' ||
            value.includes(
              'storage location'
            )
          ) {
            map.location =
              column;
          }

          else if (
            value ===
              'amount' ||
            value.includes(
              'total amount'
            )
          ) {
            map.amount =
              column;
          }
        }
      );

      return {
        row: rowNumber,
        map
      };
    }
  }

  return null;
}

function findLegacyHeader(
  worksheet
) {
  for (
    let rowNumber = 1;
    rowNumber <=
    Math.min(
      worksheet.rowCount,
      30
    );
    rowNumber++
  ) {
    const values =
      headerValues(
        worksheet,
        rowNumber
      );

    const map = {};

    values.forEach(
      (
        value,
        column
      ) => {
        if (!value) {
          return;
        }

        if (
          [
            'ref #',
            'ref no'
          ].includes(value) ||
          value.includes(
            'reference'
          ) ||
          value.includes(
            'invoice'
          )
        ) {
          map.reference =
            column;
        }

        else if (
          value === 'date' ||
          value.includes(
            'sale date'
          ) ||
          value.includes(
            'transaction date'
          )
        ) {
          map.date =
            column;
        }

        else if (
          value.includes(
            'customer'
          )
        ) {
          map.customer =
            column;
        }

        else if (
          value ===
            'amount' ||
          value.includes(
            'total amount'
          )
        ) {
          map.amount =
            column;
        }

        else if (
          [
            'items',
            'item'
          ].includes(value) ||
          value.includes(
            'item description'
          ) ||
          value.includes(
            'items sold'
          )
        ) {
          map.items =
            column;
        }
      }
    );

    if (
      map.reference &&
      map.date &&
      map.customer &&
      map.items
    ) {
      return {
        row: rowNumber,
        map
      };
    }
  }

  return null;
}

function findDemandHeader(
  worksheet
) {
  for (
    let rowNumber = 1;
    rowNumber <=
    Math.min(
      worksheet.rowCount,
      30
    );
    rowNumber++
  ) {
    const values =
      headerValues(
        worksheet,
        rowNumber
      );

    const map = {};

    values.forEach(
      (
        value,
        column
      ) => {
        if (!value) {
          return;
        }

        if (
          value === 'date' ||
          value ===
            'sale date' ||
          value ===
            'demand date' ||
          value ===
            'transaction date'
        ) {
          map.date =
            column;
        }

        else if (
          value.includes(
            'part number'
          ) ||
          [
            'part no',
            'part no.',
            'part #',
            'part#',
            'partnumber',
            'sku',
            'product code'
          ].includes(value)
        ) {
          map.partNumber =
            column;
        }

        else if (
          [
            'demand quantity',
            'demand qty',
            'quantity sold',
            'sales quantity',
            'units sold',
            'qty sold',
            'demand'
          ].includes(value)
        ) {
          map.quantity =
            column;
        }

        else if (
          value === 'tier' ||
          value.includes(
            'training tier'
          )
        ) {
          map.tier =
            column;
        }

        else if (
          value ===
            'source' ||
          value.includes(
            'demand source'
          )
        ) {
          map.source =
            column;
        }
      }
    );

    if (
      map.date &&
      map.partNumber &&
      map.quantity
    ) {
      return {
        row: rowNumber,
        map
      };
    }
  }

  return null;
}

function getValue(
  row,
  map,
  key
) {
  return map[key]
    ? cellValue(
        row.getCell(
          map[key]
        )
      )
    : null;
}

function normalizePartKey(
  value
) {
  return String(
    value ?? ''
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeDescriptionKey(
  description,
  brand = ''
) {
  const desc =
    String(
      description ?? ''
    )
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');

  const brandKey =
    String(
      brand ?? ''
    )
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');

  if (!desc) {
    return '';
  }

  return `${desc}|${brandKey}`;
}

function spreadsheetHash(
  buffer
) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

async function assertNotImported(
  importType,
  hash,
  message
) {
  const previous =
    await adminDb
      .from(
        'import_batches'
      )
      .select(
        'id,created_at'
      )
      .eq(
        'import_type',
        importType
      )
      .eq(
        'file_sha256',
        hash
      )
      .eq(
        'status',
        'completed'
      )
      .limit(1);

  if (previous.error) {
    throw previous.error;
  }

  if (
    previous.data?.length
  ) {
    const error =
      new Error(
        message ||
        'This exact spreadsheet was already imported.'
      );

    error.status = 409;
    throw error;
  }
}

async function createBatch(
  fileName,
  hash,
  importType,
  userId
) {
  const {
    data,
    error
  } =
    await adminDb
      .from(
        'import_batches'
      )
      .insert({
        file_name:
          cleanText(
            fileName,
            255
          ) ||
          'spreadsheet',

        file_sha256:
          hash,

        import_type:
          importType,

        created_by:
          userId
      })
      .select('*')
      .single();

  if (error) {
    throw error;
  }

  return data;
}

async function completeBatch(
  batchId,
  {
    read,
    imported,
    skipped,
    warnings
  }
) {
  const {
    error
  } =
    await adminDb
      .from(
        'import_batches'
      )
      .update({
        status:
          'completed',

        rows_read:
          read,

        rows_imported:
          imported,

        rows_skipped:
          skipped,

        warnings,

        completed_at:
          new Date()
            .toISOString()
      })
      .eq(
        'id',
        batchId
      );

  if (error) {
    throw error;
  }
}

async function failBatch(
  batchId,
  warnings,
  importError
) {
  try {
    await adminDb
      .from(
        'import_batches'
      )
      .update({
        status:
          'failed',

        warnings: [
          ...warnings,
          String(
            importError?.message ||
            importError
          )
        ],

        completed_at:
          new Date()
            .toISOString()
      })
      .eq(
        'id',
        batchId
      );

  } catch (
    batchError
  ) {
    console.error(
      'FAILED TO UPDATE IMPORT BATCH:',
      batchError
    );
  }
}

async function upsertSupplier(
  name,
  cache = null
) {
  const clean =
    cleanText(
      name,
      180
    );

  if (!clean) {
    return null;
  }

  const key =
    clean.toUpperCase();

  if (
    cache?.has(key)
  ) {
    return cache.get(
      key
    );
  }

  const {
    data,
    error
  } =
    await adminDb
      .from(
        'suppliers'
      )
      .upsert(
        {
          name: clean
        },
        {
          onConflict:
            'name'
        }
      )
      .select(
        'id,name'
      )
      .single();

  if (error) {
    throw error;
  }

  if (cache) {
    cache.set(
      key,
      data
    );
  }

  return data;
}

function addProductToCaches(
  product,
  partCache,
  descriptionCache
) {
  const partKey =
    normalizePartKey(
      product?.part_number
    );

  if (partKey) {
    partCache.set(
      partKey,
      product
    );
  }

  const descriptionKey =
    normalizeDescriptionKey(
      product?.description,
      product?.brand
    );

  if (descriptionKey) {
    descriptionCache.set(
      descriptionKey,
      product
    );
  }
}

function findExistingProduct(
  record,
  partCache,
  descriptionCache
) {
  const partKey =
    normalizePartKey(
      record.partNumber
    );

  if (
    partKey &&
    partCache.has(
      partKey
    )
  ) {
    return partCache.get(
      partKey
    );
  }

  const descriptionKey =
    normalizeDescriptionKey(
      record.description,
      record.brand
    );

  if (
    descriptionKey &&
    descriptionCache.has(
      descriptionKey
    )
  ) {
    return descriptionCache.get(
      descriptionKey
    );
  }

  return null;
}

async function findOrCreateProduct(
  record,
  partCache = null,
  descriptionCache = null
) {
  const partNumber =
    cleanText(
      record.partNumber,
      120
    );

  const partKey =
    normalizePartKey(
      partNumber
    );

  if (
    partKey &&
    partCache?.has(
      partKey
    )
  ) {
    return partCache.get(
      partKey
    );
  }

  if (partNumber) {
    const {
      data,
      error
    } =
      await adminDb
        .from(
          'products'
        )
        .select('*')
        .ilike(
          'part_number',
          partNumber
        )
        .limit(1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      if (
        partCache &&
        descriptionCache
      ) {
        addProductToCaches(
          data,
          partCache,
          descriptionCache
        );
      }

      return data;
    }
  }

  const description =
    cleanText(
      record.description,
      500
    );

  if (!description) {
    return null;
  }

  if (!partNumber) {
    let matchQuery =
      adminDb
        .from(
          'products'
        )
        .select('*')
        .ilike(
          'description',
          description
        );

    const brand =
      cleanText(
        record.brand,
        120
      );

    if (brand) {
      matchQuery =
        matchQuery.ilike(
          'brand',
          brand
        );
    }

    const {
      data: existing,
      error
    } =
      await matchQuery
        .limit(1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (existing) {
      if (
        partCache &&
        descriptionCache
      ) {
        addProductToCaches(
          existing,
          partCache,
          descriptionCache
        );
      }

      return existing;
    }
  }

  const {
    data,
    error
  } =
    await adminDb
      .from(
        'products'
      )
      .insert({
        part_number:
          partNumber,

        sub_number:
          cleanText(
            record.subNumber,
            120
          ),

        description,

        brand:
          cleanText(
            record.brand,
            120
          ),

        unit:
          cleanText(
            record.unit,
            40
          ),

        location:
          cleanText(
            record.location,
            80
          ),

        unit_cost:
          numberOr(
            record.unitCost,
            0
          ),

        selling_price:
          numberOr(
            record.price,
            0
          )
      })
      .select('*')
      .single();

  if (error) {
    if (
      error.code ===
        '23505' &&
      partNumber
    ) {
      const retry =
        await adminDb
          .from(
            'products'
          )
          .select('*')
          .ilike(
            'part_number',
            partNumber
          )
          .limit(1)
          .maybeSingle();

      if (
        !retry.error &&
        retry.data
      ) {
        if (
          partCache &&
          descriptionCache
        ) {
          addProductToCaches(
            retry.data,
            partCache,
            descriptionCache
          );
        }

        return retry.data;
      }
    }

    throw error;
  }

  if (
    partCache &&
    descriptionCache
  ) {
    addProductToCaches(
      data,
      partCache,
      descriptionCache
    );
  }

  return data;
}

function inventorySheets(
  workbook
) {
  const candidates =
    workbook.worksheets
      .map(
        worksheet => ({
          ws:
            worksheet,

          header:
            headerMap(
              worksheet
            )
        })
      )
      .filter(
        item =>
          item.header
      );

  if (
    !candidates.length
  ) {
    return {
      candidates,
      snapshot:
        null
    };
  }

  const scored =
    candidates
      .map(
        candidate => {
          const map =
            candidate
              .header
              .map;

          let score = 0;

          if (
            map.partNumber
          ) {
            score += 3;
          }

          if (
            map.description
          ) {
            score += 3;
          }

          if (
            map.quantity
          ) {
            score += 4;
          }

          if (
            map.price
          ) {
            score += 2;
          }

          if (
            map.location
          ) {
            score += 2;
          }

          if (
            map.unit
          ) {
            score += 1;
          }

          if (
            map.date
          ) {
            score -= 4;
          }

          if (
            map.reference
          ) {
            score -= 3;
          }

          if (
            map.supplier
          ) {
            score -= 3;
          }

          return {
            ...candidate,
            score
          };
        }
      )
      .sort(
        (
          first,
          second
        ) =>
          second.score -
          first.score
      );

  return {
    candidates,
    snapshot:
      scored[0]
  };
}

export async function detectSpreadsheetType(
  buffer,
  fileName
) {
  const workbook =
    await loadSpreadsheet(
      buffer,
      fileName
    );

  const demand =
    workbook.worksheets.some(
      worksheet =>
        Boolean(
          findDemandHeader(
            worksheet
          )
        )
    );

  if (demand) {
    return 'demand-training';
  }

  const legacy =
    workbook.worksheets.some(
      worksheet =>
        Boolean(
          findLegacyHeader(
            worksheet
          )
        )
    );

  if (legacy) {
    return 'legacy-sales';
  }

  const inventory =
    workbook.worksheets.some(
      worksheet =>
        Boolean(
          headerMap(
            worksheet
          )
        )
    );

  if (inventory) {
    return 'inventory';
  }

  const error =
    new Error(
      'Could not recognize this spreadsheet. Expected inventory, sales, or demand-training columns.'
    );

  error.status = 422;

  throw error;
}

export async function importInventoryWorkbook(
  buffer,
  fileName,
  userId
) {
  const fileSha256 =
    spreadsheetHash(
      buffer
    );

  await assertNotImported(
    'inventory',
    fileSha256,
    'This exact inventory spreadsheet was already imported.'
  );

  const workbook =
    await loadSpreadsheet(
      buffer,
      fileName
    );

  const {
    candidates,
    snapshot
  } =
    inventorySheets(
      workbook
    );

  if (!snapshot) {
    const error =
      new Error(
        'No inventory-style table was found. Include Part Number or Description plus Quantity columns.'
      );

    error.status = 422;

    throw error;
  }

  const batch =
    await createBatch(
      fileName,
      fileSha256,
      'inventory',
      userId
    );

  const [
    existingProducts,
    existingSuppliers
  ] =
    await Promise.all([
      fetchAll(
        () =>
          adminDb
            .from(
              'products'
            )
            .select('*')
      ),

      fetchAll(
        () =>
          adminDb
            .from(
              'suppliers'
            )
            .select(
              'id,name'
            )
      )
    ]);

  const productCache =
    new Map();

  const descriptionCache =
    new Map();

  for (
    const product
    of existingProducts
  ) {
    addProductToCaches(
      product,
      productCache,
      descriptionCache
    );
  }

  const supplierCache =
    new Map(
      existingSuppliers.map(
        supplier => [
          String(
            supplier.name ||
            ''
          ).toUpperCase(),
          supplier
        ]
      )
    );

  let read = 0;
  let imported = 0;
  let skipped = 0;

  const warnings = [];
  const purchaseRows = [];

  const supplierLinks =
    new Map();

  try {
    /*
      IMPORTANT:
      The current Inventory snapshot
      is always processed first.
    */
    const orderedCandidates = [
      snapshot,
      ...candidates.filter(
        item =>
          item.ws !==
          snapshot.ws
      )
    ];

    for (
      const {
        ws,
        header
      }
      of orderedCandidates
    ) {
      const isSnapshot =
        ws === snapshot.ws;

      for (
        let rowNumber =
          header.row + 1;

        rowNumber <=
          ws.rowCount;

        rowNumber++
      ) {
        const row =
          ws.getRow(
            rowNumber
          );

        const record = {
          partNumber:
            getValue(
              row,
              header.map,
              'partNumber'
            ),

          subNumber:
            getValue(
              row,
              header.map,
              'subNumber'
            ),

          description:
            getValue(
              row,
              header.map,
              'description'
            ),

          brand:
            getValue(
              row,
              header.map,
              'brand'
            ),

          quantity:
            getValue(
              row,
              header.map,
              'quantity'
            ),

          unitCost:
            getValue(
              row,
              header.map,
              'unitCost'
            ),

          price:
            getValue(
              row,
              header.map,
              'price'
            ),

          reference:
            getValue(
              row,
              header.map,
              'reference'
            ),

          date:
            getValue(
              row,
              header.map,
              'date'
            ),

          supplier:
            getValue(
              row,
              header.map,
              'supplier'
            ),

          notes:
            getValue(
              row,
              header.map,
              'notes'
            ),

          unit:
            getValue(
              row,
              header.map,
              'unit'
            ),

          location:
            getValue(
              row,
              header.map,
              'location'
            ),

          amount:
            getValue(
              row,
              header.map,
              'amount'
            )
        };

        if (
          !cleanText(
            record.description
          ) &&
          !cleanText(
            record.partNumber
          )
        ) {
          continue;
        }

        read++;

        const quantity =
          numberOr(
            record.quantity,
            0
          );

        if (
          quantity < 0
        ) {
          skipped++;
          continue;
        }

        let product =
          null;

        /*
          ONLY CURRENT INVENTORY
          CAN CREATE PRODUCTS
        */
        if (isSnapshot) {
          product =
            await findOrCreateProduct(
              record,
              productCache,
              descriptionCache
            );
        }

        /*
          PURCHASE HISTORY
          CAN ONLY MATCH PRODUCTS
          THAT ALREADY EXIST
          IN CURRENT INVENTORY
        */
        else {
          product =
            findExistingProduct(
              record,
              productCache,
              descriptionCache
            );
        }

        if (!product) {
          skipped++;
          continue;
        }

        if (isSnapshot) {
          const updatedValues = {
            current_stock:
              quantity,

            sub_number:
              cleanText(
                record.subNumber,
                120
              ) ??
              product.sub_number,

            brand:
              cleanText(
                record.brand,
                120
              ) ??
              product.brand,

            unit:
              cleanText(
                record.unit,
                40
              ) ??
              product.unit,

            location:
              cleanText(
                record.location,
                80
              ) ??
              product.location,

            unit_cost:
              numberOr(
                record.unitCost,
                product.unit_cost ||
                0
              ),

            selling_price:
              numberOr(
                record.price,
                product.selling_price ||
                0
              ),

            active:
              true
          };

          const {
            data:
              updatedProduct,
            error
          } =
            await adminDb
              .from(
                'products'
              )
              .update(
                updatedValues
              )
              .eq(
                'id',
                product.id
              )
              .select('*')
              .single();

          if (error) {
            throw error;
          }

          addProductToCaches(
            updatedProduct,
            productCache,
            descriptionCache
          );

          imported++;

          continue;
        }

        /*
          PURCHASE HISTORY
          MUST HAVE POSITIVE
          PURCHASE QUANTITY
        */
        if (
          quantity <= 0
        ) {
          skipped++;
          continue;
        }

        const supplier =
          await upsertSupplier(
            record.supplier,
            supplierCache
          );

        if (supplier) {
          supplierLinks.set(
            `${product.id}|${supplier.id}`,
            {
              product_id:
                product.id,

              supplier_id:
                supplier.id,

              latest_unit_cost:
                numberOr(
                  record.unitCost,
                  0
                )
            }
          );
        }

        purchaseRows.push({
          product_id:
            product.id,

          supplier_id:
            supplier?.id ||
            null,

          part_number:
            cleanText(
              record.partNumber,
              120
            ),

          description:
            cleanText(
              record.description,
              500
            ),

          brand:
            cleanText(
              record.brand,
              120
            ),

          quantity,

          unit_cost:
            numberOr(
              record.unitCost,
              0
            ),

          amount:
            numberOr(
              record.amount,
              quantity *
              numberOr(
                record.unitCost,
                0
              )
            ),

          reference_no:
            cleanText(
              record.reference,
              180
            ),

          purchase_date:
            excelDate(
              record.date
            ),

          notes:
            cleanText(
              record.notes,
              1000
            ),

          import_batch_id:
            batch.id
        });
      }
    }

    const linkRows = [
      ...supplierLinks.values()
    ];

    for (
      let index = 0;
      index <
        linkRows.length;
      index += 500
    ) {
      const chunk =
        linkRows.slice(
          index,
          index + 500
        );

      const {
        error
      } =
        await adminDb
          .from(
            'product_suppliers'
          )
          .upsert(
            chunk,
            {
              onConflict:
                'product_id,supplier_id'
            }
          );

      if (error) {
        throw error;
      }
    }

    for (
      let index = 0;
      index <
        purchaseRows.length;
      index += 500
    ) {
      const chunk =
        purchaseRows.slice(
          index,
          index + 500
        );

      const {
        error
      } =
        await adminDb
          .from(
            'purchase_history'
          )
          .insert(
            chunk
          );

      if (error) {
        throw error;
      }

      imported +=
        chunk.length;
    }

    warnings.push(
      `Detected "${snapshot.ws.name}" as the current-stock snapshot by its columns. Historical sheets were linked only to products already present in the current inventory; they were not allowed to create extra active products.`
    );

    await completeBatch(
      batch.id,
      {
        read,
        imported,
        skipped,
        warnings
      }
    );

    return {
      batchId:
        batch.id,

      detectedType:
        'inventory',

      snapshotSheet:
        snapshot.ws.name,

      rowsRead:
        read,

      rowsImported:
        imported,

      rowsSkipped:
        skipped,

      warnings
    };

  } catch (error) {
    await failBatch(
      batch.id,
      warnings,
      error
    );

    throw error;
  }
}

export async function importLegacySalesWorkbook(
  buffer,
  fileName,
  userId,
  useProxy = false
) {
  const fileSha256 =
    spreadsheetHash(
      buffer
    );

  await assertNotImported(
    'legacy_sales',
    fileSha256,
    'This exact sales spreadsheet was already imported.'
  );

  const workbook =
    await loadSpreadsheet(
      buffer,
      fileName
    );

  const batch =
    await createBatch(
      fileName,
      fileSha256,
      'legacy_sales',
      userId
    );

  const products =
    await fetchAll(
      () =>
        adminDb
          .from(
            'products'
          )
          .select(
            'id,part_number'
          )
          .not(
            'part_number',
            'is',
            null
          )
    );

  const partLookup =
    products
      .filter(
        product =>
          product.part_number &&
          String(
            product.part_number
          )
            .trim()
            .length >= 4
      )
      .sort(
        (
          first,
          second
        ) =>
          String(
            second.part_number
          ).length -
          String(
            first.part_number
          ).length
      );

  let read = 0;
  let imported = 0;
  let skipped = 0;
  let proxies = 0;

  const warnings = [];

  try {
    let foundTable =
      false;

    for (
      const worksheet
      of workbook.worksheets
    ) {
      const header =
        findLegacyHeader(
          worksheet
        );

      if (!header) {
        continue;
      }

      foundTable = true;

      for (
        let rowNumber =
          header.row + 1;

        rowNumber <=
          worksheet.rowCount;

        rowNumber++
      ) {
        const row =
          worksheet.getRow(
            rowNumber
          );

        const reference =
          cleanText(
            getValue(
              row,
              header.map,
              'reference'
            ),
            180
          );

        const date =
          excelDate(
            getValue(
              row,
              header.map,
              'date'
            )
          );

        const customer =
          cleanText(
            getValue(
              row,
              header.map,
              'customer'
            ),
            240
          );

        const amountRaw =
          getValue(
            row,
            header.map,
            'amount'
          );

        const items =
          cleanText(
            getValue(
              row,
              header.map,
              'items'
            ),
            1500
          );

        if (
          !reference &&
          !date &&
          !customer &&
          !items
        ) {
          continue;
        }

        if (
          (
            customer ||
            ''
          ).toUpperCase() ===
          'CANCELLED'
        ) {
          skipped++;
          continue;
        }

        read++;

        const upperItems =
          (
            items ||
            ''
          ).toUpperCase();

        const matched =
          partLookup.find(
            product =>
              upperItems.includes(
                String(
                  product.part_number
                )
                  .trim()
                  .toUpperCase()
              )
          ) ||
          null;

        const {
          error
        } =
          await adminDb
            .from(
              'legacy_sales'
            )
            .insert({
              reference_no:
                reference,

              sale_date:
                date,

              customer_name:
                customer,

              amount:
                numberOr(
                  amountRaw,
                  0
                ),

              raw_items:
                items,

              matched_product_id:
                matched?.id ||
                null,

              import_batch_id:
                batch.id
            });

        if (error) {
          throw error;
        }

        imported++;

        if (
          useProxy &&
          matched &&
          date
        ) {
          const {
            error:
              proxyError
          } =
            await adminDb
              .from(
                'demand_observations'
              )
              .insert({
                product_id:
                  matched.id,

                occurred_on:
                  date,

                quantity:
                  1,

                source:
                  'legacy_transaction_proxy',

                source_reference:
                  reference
              });

          if (!proxyError) {
            proxies++;
          } else {
            console.error(
              'LEGACY PROXY ERROR:',
              proxyError
            );
          }
        }
      }
    }

    if (!foundTable) {
      const error =
        new Error(
          'No sales table was found. Expected Reference/Ref #, Date, Customer, and Items columns.'
        );

      error.status = 422;

      throw error;
    }

    if (!useProxy) {
      warnings.push(
        'Sales rows were imported for reporting. No 1-unit demand proxy was created because the proxy option was not enabled.'
      );
    }

    await completeBatch(
      batch.id,
      {
        read,
        imported,
        skipped,
        warnings
      }
    );

    return {
      batchId:
        batch.id,

      detectedType:
        'legacy-sales',

      rowsRead:
        read,

      rowsImported:
        imported,

      rowsSkipped:
        skipped,

      proxyObservations:
        proxies,

      warnings
    };

  } catch (error) {
    await failBatch(
      batch.id,
      warnings,
      error
    );

    throw error;
  }
}

function scoreDemandSheet(
  worksheet,
  header
) {
  let valid = 0;
  let tierB = 0;
  let tierC = 0;

  const end =
    Math.min(
      worksheet.rowCount,
      header.row + 1000
    );

  for (
    let rowNumber =
      header.row + 1;

    rowNumber <= end;

    rowNumber++
  ) {
    const row =
      worksheet.getRow(
        rowNumber
      );

    const date =
      excelDate(
        getValue(
          row,
          header.map,
          'date'
        )
      );

    const partNumber =
      cleanText(
        getValue(
          row,
          header.map,
          'partNumber'
        ),
        120
      );

    const quantity =
      numberOr(
        getValue(
          row,
          header.map,
          'quantity'
        ),
        0
      );

    if (
      !date ||
      !partNumber ||
      quantity <= 0
    ) {
      continue;
    }

    valid++;

    const tier =
      String(
        getValue(
          row,
          header.map,
          'tier'
        ) ||
        ''
      ).toUpperCase();

    if (
      tier.startsWith('B')
    ) {
      tierB++;
    }

    if (
      tier.startsWith('C')
    ) {
      tierC++;
    }
  }

  const bRatio =
    valid
      ? tierB /
        valid
      : 0;

  const cRatio =
    valid
      ? tierC /
        valid
      : 0;

  return (
    Math.min(
      valid,
      200
    ) +
    (
      bRatio *
      1000
    ) -
    (
      cRatio *
      300
    )
  );
}

function bestDemandSheet(
  workbook
) {
  const candidates =
    workbook.worksheets
      .map(
        worksheet => ({
          ws:
            worksheet,

          header:
            findDemandHeader(
              worksheet
            )
        })
      )
      .filter(
        candidate =>
          candidate.header
      );

  if (
    !candidates.length
  ) {
    return null;
  }

  return candidates
    .map(
      candidate => ({
        ...candidate,

        score:
          scoreDemandSheet(
            candidate.ws,
            candidate.header
          )
      })
    )
    .sort(
      (
        first,
        second
      ) =>
        second.score -
        first.score
    )[0];
}

export async function importDemandTrainingWorkbook(
  buffer,
  fileName,
  userId
) {
  const fileSha256 =
    spreadsheetHash(
      buffer
    );

  const workbook =
    await loadSpreadsheet(
      buffer,
      fileName
    );

  const selected =
    bestDemandSheet(
      workbook
    );

  if (!selected) {
    const error =
      new Error(
        'No demand-training table was found. Expected Date, Part Number, and Demand Quantity columns.'
      );

    error.status = 422;

    throw error;
  }

  const batch =
    await createBatch(
      fileName,
      fileSha256,
      'demand_training',
      userId
    );

  let read = 0;
  let imported = 0;
  let skipped = 0;

  const warnings = [];

  try {
    const products =
      await fetchAll(
        () =>
          adminDb
            .from(
              'products'
            )
            .select(
              'id,part_number,description'
            )
            .eq(
              'active',
              true
            )
      );

    const lookup =
      new Map();

    for (
      const product
      of products
    ) {
      const key =
        normalizePartKey(
          product.part_number
        );

      if (
        key &&
        !lookup.has(key)
      ) {
        lookup.set(
          key,
          product
        );
      }
    }

    const aggregate =
      new Map();

    const unmatched =
      new Set();

    for (
      let rowNumber =
        selected.header.row +
        1;

      rowNumber <=
        selected.ws.rowCount;

      rowNumber++
    ) {
      const row =
        selected.ws.getRow(
          rowNumber
        );

      const date =
        excelDate(
          getValue(
            row,
            selected.header.map,
            'date'
          )
        );

      const partNumber =
        cleanText(
          getValue(
            row,
            selected.header.map,
            'partNumber'
          ),
          120
        );

      const quantity =
        numberOr(
          getValue(
            row,
            selected.header.map,
            'quantity'
          ),
          0
        );

      if (
        !date &&
        !partNumber &&
        !quantity
      ) {
        continue;
      }

      read++;

      if (
        !date ||
        !partNumber ||
        quantity <= 0
      ) {
        skipped++;
        continue;
      }

      const product =
        lookup.get(
          normalizePartKey(
            partNumber
          )
        );

      if (!product) {
        skipped++;

        unmatched.add(
          partNumber
        );

        continue;
      }

      const key =
        `${product.id}|${date}`;

      const existing =
        aggregate.get(
          key
        ) ||
        {
          product_id:
            product.id,

          occurred_on:
            date,

          quantity:
            0,

          partNumber
        };

      existing.quantity +=
        quantity;

      aggregate.set(
        key,
        existing
      );
    }

    const rows = [
      ...aggregate.values()
    ].map(
      item => ({
        product_id:
          item.product_id,

        occurred_on:
          item.occurred_on,

        quantity:
          Number(
            item.quantity
              .toFixed(4)
          ),

        source:
          'imported_training_data',

        source_reference:
          `training:${batch.id}:${cleanText(
            selected.ws.name,
            80
          )}:${cleanText(
            item.partNumber,
            120
          )}`
      })
    );

    if (!rows.length) {
      const error =
        new Error(
          'No training rows matched the current Inventory. Import the inventory spreadsheet first, then upload the demand-training spreadsheet again.'
        );

      error.status = 422;

      throw error;
    }

    const cleared =
      await adminDb
        .from(
          'demand_observations'
        )
        .delete()
        .eq(
          'source',
          'imported_training_data'
        );

    if (
      cleared.error
    ) {
      throw cleared.error;
    }

    for (
      let index = 0;
      index <
        rows.length;

      index += 500
    ) {
      const chunk =
        rows.slice(
          index,
          index + 500
        );

      const {
        error
      } =
        await adminDb
          .from(
            'demand_observations'
          )
          .insert(
            chunk
          );

      if (error) {
        throw error;
      }

      imported +=
        chunk.length;
    }

    if (
      unmatched.size
    ) {
      warnings.push(
        `${
          unmatched.size
        } part number(s) were not found in Inventory and were skipped. Examples: ${
          [
            ...unmatched
          ]
            .slice(
              0,
              8
            )
            .join(', ')
        }`
      );
    }

    warnings.push(
      `Automatically selected "${selected.ws.name}" because it contains the strongest usable Date + Part Number + Demand Quantity dataset. The uploaded filename was not used to determine the dataset type.`
    );

    await completeBatch(
      batch.id,
      {
        read,
        imported,
        skipped,
        warnings
      }
    );

    return {
      batchId:
        batch.id,

      detectedType:
        'demand-training',

      selectedSheet:
        selected.ws.name,

      rowsRead:
        read,

      rowsImported:
        imported,

      rowsSkipped:
        skipped,

      matchedProducts:
        new Set(
          rows.map(
            item =>
              item.product_id
          )
        ).size,

      warnings
    };

  } catch (error) {
    await failBatch(
      batch.id,
      warnings,
      error
    );

    throw error;
  }
}

export async function importSpreadsheetAuto(
  buffer,
  fileName,
  userId,
  requestedType = 'auto',
  useProxy = false
) {
  const type =
    requestedType === 'auto'
      ? await detectSpreadsheetType(
          buffer,
          fileName
        )
      : requestedType;

  if (
    type === 'inventory'
  ) {
    return importInventoryWorkbook(
      buffer,
      fileName,
      userId
    );
  }

  if (
    type ===
      'legacy-sales' ||
    type ===
      'legacy_sales'
  ) {
    return importLegacySalesWorkbook(
      buffer,
      fileName,
      userId,
      useProxy
    );
  }

  if (
    type ===
      'demand-training' ||
    type ===
      'demand_training'
  ) {
    return importDemandTrainingWorkbook(
      buffer,
      fileName,
      userId
    );
  }

  const error =
    new Error(
      'Unknown spreadsheet import type.'
    );

  error.status = 400;

  throw error;
}