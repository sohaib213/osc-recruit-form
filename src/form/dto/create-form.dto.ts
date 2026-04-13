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

export enum Committee {
  Frontend = 'frontend',
  Backend = 'backend',
  ScienceTech = 'science and tech',
  Linux = 'linux',
  GameDev = 'game development',
  UIUX = 'ui/ux',
  Flutter = 'flutter',
  Blender = 'blender',
  Media = 'media',
  HR = 'hr',
  PR = 'pr',
}
export class CreateFormDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
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
  @IsNotEmpty()
  college_id: string;

  @IsString()
  @IsEnum(Committee)
  committee: Committee;
}
