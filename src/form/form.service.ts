import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import { CreateFormDto } from './dto/create-form.dto';
import { Mutex } from 'async-mutex';

@Injectable()
export class FormService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;
  private readonly sheetName = 'Sheet1';
  private readonly LIMIT_CELL = 'H1';
  private readonly COUNTER_CELL = 'H2';
  private readonly mutex = new Mutex();

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

  private async getLimit(): Promise<number> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!${this.LIMIT_CELL}`,
    });

    const value = response.data.values?.[0]?.[0];

    if (value === undefined || value === null || value === '') {
      throw new Error(
        'Limit cell (H1) is empty. Please set a limit value in the sheet.',
      );
    }

    return parseInt(value, 10) || 0;
  }

  private async getCounter(): Promise<number> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!${this.COUNTER_CELL}`,
    });

    const value = response.data.values?.[0]?.[0];

    if (value === undefined || value === null || value === '') {
      await this.setCounter(0);
      return 0;
    }

    return parseInt(value, 10) || 0;
  }

  private async setCounter(value: number): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!${this.COUNTER_CELL}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[value]],
      },
    });
  }

  async checkCapacity(): Promise<{ isFull: boolean }> {
    const [count, limit] = await Promise.all([
      this.getCounter(),
      this.getLimit(),
    ]);

    return {
      isFull: count >= limit,
    };
  }

  async add(createFormDto: CreateFormDto): Promise<{
    success: boolean;
    message: string;
    data: CreateFormDto;
  }> {
    return await this.mutex.runExclusive(async () => {
      try {
        const [
          currentCount,
          limit,
          existingEmails,
          existingCollegeIds,
          existingPhones,
        ] = await Promise.all([
          this.getCounter(),
          this.getLimit(),
          this.getExistingEmails(),
          this.getExistingCollegeIds(),
          this.getExistingPhones(),
        ]);

        if (currentCount >= limit) {
          throw new BadRequestException(
            `Form limit of ${limit} has been reached. No more submissions allowed.`,
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

        await this.setCounter(currentCount + 1);

        return {
          success: true,
          message: 'Form submitted successfully',
          data: createFormDto,
        };
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error submitting form:', errorMessage);
        throw new InternalServerErrorException(
          `Failed to submit form: ${errorMessage}`,
        );
      }
    });
  }

  private async getExistingEmails(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!B:B`,
    });

    const rows = response.data.values || [];
    return rows.slice(1).map((row) => row[0]?.toLowerCase() || '');
  }

  private async getExistingCollegeIds(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!F:F`,
    });

    const rows = response.data.values || [];
    return rows.slice(1).map((row) => row[0]?.toLowerCase() || '');
  }

  private async getExistingPhones(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!D:D`,
    });

    const rows = response.data.values || [];
    return rows.slice(1).map((row) => row[0]?.replace(/^'/, '') || '');
  }
}
