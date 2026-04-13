import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import { CreateFormDto, Committee } from './dto/create-form.dto';
import { Mutex } from 'async-mutex';

@Injectable()
export class FormService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;
  private readonly sheetName = 'Sheet1';
  private readonly COMMITTEE_COUNT_COL = 'J';
  private readonly COMMITTEE_MAX_COL = 'K';
  private readonly mutex = new Mutex();

  private readonly COMMITTEE_ROWS: Record<Committee, number> = {
    [Committee.Frontend]: 1,
    [Committee.Backend]: 2,
    [Committee.ScienceTech]: 3,
    [Committee.Linux]: 4,
    [Committee.GameDev]: 5,
    [Committee.UIUX]: 6,
    [Committee.Flutter]: 7,
    [Committee.Blender]: 8,
    [Committee.HR]: 9,
    [Committee.PR]: 10,
  };

  constructor() {
    this.initializeGoogleSheets();
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '';
  }

  private initializeGoogleSheets(): void {
    const credentials = {
      type: process.env.GOOGLE_TYPE,
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: process.env.GOOGLE_AUTH_URI,
      token_uri: process.env.GOOGLE_TOKEN_URI,
      auth_provider_x509_cert_url:
        process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
    };

    const auth = new google.auth.GoogleAuth({
      credentials: credentials as any,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  // ── Per-committee capacity ───────────────────────────────────────────────

  private async getAllCommitteeCapacities(): Promise<
    Record<Committee, { current: number; max: number }>
  > {
    const committees = Object.values(Committee) as Committee[];
    const rows = Object.values(this.COMMITTEE_ROWS);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!${this.COMMITTEE_COUNT_COL}${minRow}:${this.COMMITTEE_MAX_COL}${maxRow}`,
    });

    const values = response.data.values || [];
    const result = {} as Record<Committee, { current: number; max: number }>;

    for (const committee of committees) {
      const rowIndex = this.COMMITTEE_ROWS[committee] - minRow;
      const rowData = values[rowIndex] || [];
      result[committee] = {
        current: parseInt(rowData[0], 10) || 0,
        max: parseInt(rowData[1], 10) || 0,
      };
    }

    return result;
  }

  private async getCommitteeCapacity(
    committee: Committee,
  ): Promise<{ current: number; max: number }> {
    const row = this.COMMITTEE_ROWS[committee];
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!${this.COMMITTEE_COUNT_COL}${row}:${this.COMMITTEE_MAX_COL}${row}`,
    });
    const rowData = response.data.values?.[0] || [];
    return {
      current: parseInt(rowData[0], 10) || 0,
      max: parseInt(rowData[1], 10) || 0,
    };
  }

  private async incrementCommitteeCounter(
    committee: Committee,
    currentCount: number,
  ): Promise<void> {
    const row = this.COMMITTEE_ROWS[committee];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!${this.COMMITTEE_COUNT_COL}${row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[currentCount + 1]] },
    });
  }

  // ── Public endpoints ─────────────────────────────────────────────────────

  async getAvailableCommittees(): Promise<{ available: Committee[] }> {
    const capacities = await this.getAllCommitteeCapacities();
    const available: Committee[] = [];

    for (const [committee, cap] of Object.entries(capacities) as [
      Committee,
      { current: number; max: number },
    ][]) {
      if (cap.current < cap.max) available.push(committee);
    }

    return { available };
  }

  async add(createFormDto: CreateFormDto): Promise<{
    success: boolean;
    message: string;
    data: CreateFormDto;
  }> {
    return await this.mutex.runExclusive(async () => {
      try {
        const [
          committeeCapacity,
          existingEmails,
          existingCollegeIds,
          existingPhones,
        ] = await Promise.all([
          this.getCommitteeCapacity(createFormDto.committee),
          this.getExistingEmails(),
          this.getExistingCollegeIds(),
          this.getExistingPhones(),
        ]);

        // Per-committee limit (max=0 means unlimited)
        if (committeeCapacity.current >= committeeCapacity.max) {
          throw new BadRequestException(
            `The ${createFormDto.committee} committee is full`,
          );
        }

        if (existingEmails.includes(createFormDto.email.toLowerCase())) {
          throw new ConflictException(
            `Email ${createFormDto.email} has already been submitted.`,
          );
        }
        if (
          existingCollegeIds.includes(createFormDto.college_id.toLowerCase())
        ) {
          throw new ConflictException(
            `College ID ${createFormDto.college_id} has already been submitted.`,
          );
        }
        if (existingPhones.includes(createFormDto.phone)) {
          throw new ConflictException(
            `Phone number ${createFormDto.phone} has already been submitted.`,
          );
        }

        const rowData: string[] = [
          createFormDto.name,
          createFormDto.email,
          String(createFormDto.academic_year),
          `'${createFormDto.phone}`,
          createFormDto.college,
          createFormDto.college_id,
          createFormDto.committee,
        ];

        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A:G`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowData] },
        });

        await this.incrementCommitteeCounter(
          createFormDto.committee,
          committeeCapacity.current,
        );

        return {
          success: true,
          message: 'Form submitted successfully',
          data: createFormDto,
        };
      } catch (error) {
        if (error instanceof HttpException) throw error;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error submitting form:', errorMessage);
        throw new InternalServerErrorException(
          `Failed to submit form: ${errorMessage}`,
        );
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getExistingEmails(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!B:B`,
    });
    return (response.data.values || [])
      .slice(1)
      .map((r) => r[0]?.toLowerCase() || '');
  }

  private async getExistingCollegeIds(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!F:F`,
    });
    return (response.data.values || [])
      .slice(1)
      .map((r) => r[0]?.toLowerCase() || '');
  }

  private async getExistingPhones(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!D:D`,
    });
    return (response.data.values || [])
      .slice(1)
      .map((r) => r[0]?.replace(/^'/, '') || '');
  }
}
