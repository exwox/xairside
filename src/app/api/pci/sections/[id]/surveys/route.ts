import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';
import { computeSampleUnitPci, computeSectionPci, pciRating, PciInputError } from '@/lib/pci';
import { cdvConfigKey, defaultCdvCurveSet, parseCdvCurveSet } from '@/lib/cdv';
import { dvConfigKey, parseDvCurveSet } from '@/lib/dv';
import { distressCatalog, type SurfaceType } from '@/lib/pci-data';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id: sectionId } = await params;
    const body = await req.json();
    const section = await prisma.pciSection.findUnique({ where: { id: sectionId } });
    if (!section || section.airportId !== auth.activeAirportId) return NextResponse.json({ error: 'Section tidak ditemukan' }, { status: 404 });
    const surfaceType: SurfaceType = section.surfaceType === 'JPCP' ? 'JPCP' : 'ASPHALT';
    const countCodes = new Set(distressCatalog(surfaceType).filter((item) => item.unit === 'COUNT').map((item) => item.code));
    if (surfaceType === 'JPCP' && (body.sampleUnits ?? []).some((unit: { slabCount?: number; distresses?: { code: number }[] }) =>
      (unit.distresses ?? []).some((item) => countCodes.has(Number(item.code)))
      && (!Number.isInteger(unit.slabCount) || (unit.slabCount ?? 0) <= 0))) {
      return NextResponse.json({ error: 'Jumlah slab sampel wajib untuk kerusakan rigit yang dihitung per slab.' }, { status: 400 });
    }
    const curveConfig = await prisma.airportConfig.findUnique({
      where: { airportId_key: { airportId: auth.activeAirportId, key: cdvConfigKey(surfaceType) } },
    });
    const cdvCurves = parseCdvCurveSet(curveConfig?.value, surfaceType)
      ?? defaultCdvCurveSet(surfaceType);
    const dvConfig = await prisma.airportConfig.findUnique({ where: { airportId_key: { airportId: auth.activeAirportId, key: dvConfigKey(surfaceType) } } });
    const dvCurves = parseDvCurveSet(dvConfig?.value, surfaceType);
    if (dvConfig && !dvCurves) {
      return NextResponse.json({ error: 'Kurva DV tersimpan tidak valid. Periksa konfigurasi Admin.' }, { status: 500 });
    }

    const sampleUnits: { no: number; areaSqm: number; pci: number; distresses: unknown[] }[] = [];
    const details: {
      no: number;
      areaSqm: number;
      slabCount: number | null;
      distresses: { code: number; name: string; severity: string; quantity: number; density: number }[];
      dvLines: { code: number; name: string; severity: string; density: number; dv: number }[];
      totalDv: number;
      maxCdv: number;
      allowableDeducts: number;
      cdvIterations: ReturnType<typeof computeSampleUnitPci>['cdvIterations'];
      pci: number;
    }[] = [];

    for (const unit of body.sampleUnits ?? []) {
      const result = computeSampleUnitPci(
        surfaceType,
        Number(unit.areaSqm ?? section.sampleUnitArea),
        (unit.distresses ?? []).map((d: { code: number; severity: 'L' | 'M' | 'H' | '-'; quantity: number }) => ({
          code: Number(d.code),
          severity: d.severity,
          quantity: Number(d.quantity),
        })),
        cdvCurves,
        dvCurves ?? undefined,
        unit.slabCount
      );
      sampleUnits.push({ no: Number(unit.no), areaSqm: Number(unit.areaSqm ?? section.sampleUnitArea), pci: result.pci, distresses: result.dvLines });
      details.push({
        no: Number(unit.no),
        areaSqm: Number(unit.areaSqm ?? section.sampleUnitArea),
        slabCount: unit.slabCount ?? null,
        distresses: (unit.distresses ?? []).map((d: { code: number; severity: string; quantity: number; density: number; name: string }) => ({
          code: d.code, name: d.name, severity: d.severity, quantity: d.quantity, density: d.density,
        })),
        dvLines: result.dvLines,
        totalDv: result.totalDv,
        maxCdv: result.maxCdv,
        allowableDeducts: result.allowableDeducts,
        cdvIterations: result.cdvIterations,
        pci: result.pci,
      });
    }

    const sectionPci = computeSectionPci(sampleUnits);
    const rating = pciRating(sectionPci);

    const survey = await prisma.pciSurvey.create({
      data: {
        airportId: auth.activeAirportId,
        sectionId,
        inspectorName: body.inspectorName ?? null,
        surveyDate: body.surveyDate ? new Date(body.surveyDate) : new Date(),
        pci: sectionPci,
        rating: rating.label,
        detailsJson: JSON.stringify(details),
      },
    });

    await prisma.pciSection.update({
      where: { id: sectionId },
      data: { lastPci: sectionPci, lastSurveyAt: new Date() },
    });

    return NextResponse.json({ survey, sectionPci, rating: rating.label, details }, { status: 201 });
  } catch (error) {
    if (error instanceof PciInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Error saving PCI survey:', error);
    return NextResponse.json({ error: 'Gagal menyimpan survey PCI' }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const { id: sectionId } = await params;
    const section = await prisma.pciSection.findUnique({ where: { id: sectionId }, select: { airportId: true } });
    if (!section || section.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Section tidak ditemukan' }, { status: 404 });
    }
    const surveys = await prisma.pciSurvey.findMany({
      where: { sectionId },
      orderBy: { surveyDate: 'desc' },
    });
    return NextResponse.json(
      surveys.map((s) => ({ ...s, details: JSON.parse(s.detailsJson) }))
    );
  } catch (error) {
    console.error('Error fetching PCI surveys:', error);
    return NextResponse.json({ error: 'Failed to fetch PCI surveys' }, { status: 500 });
  }
}
