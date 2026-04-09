import { Type } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsNumber,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';

enum College {
  ComputerScience = 'computer science',
  Other = 'other',
}

enum AcademicYear {
  First = 1,
  Second = 2,
  Third = 3,
  Fourth = 4,
}
export class CreateFormDto {
  @IsString()
  name: string;

  @IsString()
  @IsEmail()
  email: string;

  @Type(() => Number)
  @IsNumber()
  @IsEnum(AcademicYear)
  academic_year: AcademicYear;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsEnum(College)
  college: College;

  @IsString()
  college_id: string;
}
