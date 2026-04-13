import { Controller, Post, Get, Body } from '@nestjs/common';
import { FormService } from './form.service';
import { CreateFormDto } from './dto/create-form.dto';

@Controller('form')
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Post()
  Add(@Body() createFormDto: CreateFormDto) {
    return this.formService.add(createFormDto);
  }

  @Get('committees')
  getAvailableCommittees() {
    return this.formService.getAvailableCommittees();
  }
}
