import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth';
import { computeSampleUnitPci, computeSectionPci, pciRating, PciInputError, type DistressInput } from '@/lib/pci';
import { cdvConfigKey, defaultCdvCurveSet, parseCdvCurveSet } from '@/lib/cdv';
import { dvConfigKey, parseDvCurveSet } from '@/lib/dv';
import { distressCatalog, type SurfaceType } from '@/lib/pci-data';

interface UnitInput {
  areaSqm: number;
  slabCount?: number;
  distresses: DistressInput[];
}

// Simpan survey PCI: seluruh perhitungan dan kurva admin dijalankan di server.
export async function POST(req: Request) {
  try {
    const auth = await requireAuthContext(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const sectionId = body.sectionId as string;
    const units = (body.units ?? []) as UnitInput[];
    if (!sectionId || !Array.isArray(units) || units.length === 0) {
      return NextResponse.json({ error: 'sectionId dan minimal 1 sample unit wajib' }, { status: 400 });
    }
    const section = await prisma.pciSection.findUnique({ where: { id: sectionId } });
    if (!section || section.airportId !== auth.activeAirportId) {
      return NextResponse.json({ error: 'Section tidak ditemukan' }, { status: 404 });
    }

    const surfaceType: SurfaceType = section.surfaceType === 'JPCP' ? 'JPCP' : 'ASPHALT';
    const countCodes = new Set(distressCatalog(surfaceType).filter((item) => item.unit === 'COUNT').map((item) => item.code));
    for (const unit of units) {
      if (surfaceType === 'JPCP' && unit.distresses.some((item) => countCodes.has(item.code))
        && (!Number.isInteger(unit.slabCount) || (unit.slabCount ?? 0) <= 0)) {
        return NextResponse.json({ error: 'Jumlah slab sampel wajib untuk kerusakan rigit yang dihitung per slab.' }, { status: 400 });
      }
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

    const details = units.map((u, i) => {
      const areaSqm = Number(u.areaSqm) > 0 ? Number(u.areaSqm) : section.sampleUnitArea;
      const r = computeSampleUnitPci(surfaceType, areaSqm, u.distresses, cdvCurves, dvCurves ?? undefined, u.slabCount);
      return {
        no: i + 1,
        areaSqm,
        slabCount: u.slabCount ?? null,
        distresses: u.distresses.map((d) => ({
          ...d,
          density: r.dvLines.find((l) => l.code === d.code && l.severity === d.severity)?.density ?? 0,
        })),
        dvLines: r.dvLines,
        totalDv: Math.round(r.totalDv * 10) / 10,
        maxCdv: Math.round(r.maxCdv * 10) / 10,
        allowableDeducts: Math.round(r.allowableDeducts * 100) / 100,
        cdvIterations: r.cdvIterations.map((iteration) => ({
          ...iteration,
          totalDv: Math.round(iteration.totalDv * 10) / 10,
          cdv: Math.round(iteration.cdv * 10) / 10,
          deductValues: iteration.deductValues.map((value) => Math.round(value * 10) / 10),
        })),
        pci: r.pci,
      };
    });

    const pci = computeSectionPci(details.map((d) => ({ areaSqm: d.areaSqm, pci: d.pci })));
    const rating = pciRating(pci).label;
    const surveyDate = body.surveyDate ? new Date(body.surveyDate) : new Date();

    const survey = await prisma.pciSurvey.create({
      data: {
        airportId: auth.activeAirportId,
        sectionId,
        inspectorName: body.inspectorName ?? null,
        surveyDate,
        pci,
        rating,
        detailsJson: JSON.stringify(details),
      },
    });
    await prisma.pciSection.update({
      where: { id: sectionId },
      data: { lastPci: pci, lastSurveyAt: surveyDate },
    });
    return NextResponse.json({ ...survey, details }, { status: 201 });
  } catch (error) {
    if (error instanceof PciInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Error saving PCI survey:', error);
    return NextResponse.json({ error: 'Gagal menyimpan survey PCI' }, { status: 500 });
  }
}
