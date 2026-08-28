import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Users
  const inspector = await prisma.user.upsert({
    where: { email: 'inspector@airside.com' },
    update: {},
    create: {
      email: 'inspector@airside.com',
      name: 'Budi (Inspector)',
      passwordHash: 'password123', // In production, hash this password
      role: 'INSPECTOR',
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@airside.com' },
    update: {},
    create: {
      email: 'supervisor@airside.com',
      name: 'Pak Anto (Supervisor)',
      passwordHash: 'password123', // In production, hash this password
      role: 'SUPERVISOR',
    },
  });

  console.log('Users seeded:', { inspector: inspector.email, supervisor: supervisor.email });

  // Checklist Items configuration
  const checklistItems = [
    // RUNWAY
    { zone: 'RUNWAY', category: 'Pavement Area', name: 'Retak / Cracking (Runway)' },
    { zone: 'RUNWAY', category: 'Pavement Area', name: 'Lubang / Potholes (Runway)' },
    { zone: 'RUNWAY', category: 'Pavement Area', name: 'FOD (Foreign Object Debris)' },
    { zone: 'RUNWAY', category: 'Pavement Area', name: 'Joint Sealant (Runway)' },
    { zone: 'RUNWAY', category: 'Marking', name: 'Runway Designation Marking' },
    { zone: 'RUNWAY', category: 'Marking', name: 'Runway Centerline Marking' },
    { zone: 'RUNWAY', category: 'Marking', name: 'Aiming Point Marking' },
    { zone: 'RUNWAY', category: 'Marking', name: 'Touchdown Zone Marking' },
    { zone: 'RUNWAY', category: 'Lighting / AFL', name: 'Runway Edge Light' },
    { zone: 'RUNWAY', category: 'Lighting / AFL', name: 'Runway Threshold Light' },
    { zone: 'RUNWAY', category: 'Lighting / AFL', name: 'Runway End Light' },
    { zone: 'RUNWAY', category: 'Lighting / AFL', name: 'PAPI (Precision Approach Path Indicator)' },
    { zone: 'RUNWAY', category: 'Strip & Drainage', name: 'Runway Strip (Erosion/Vegetation)' },
    { zone: 'RUNWAY', category: 'Strip & Drainage', name: 'Saluran Drainase / Drainage' },

    // TAXIWAY
    { zone: 'TAXIWAY', category: 'Pavement Area', name: 'Retak / Cracking (Taxiway)' },
    { zone: 'TAXIWAY', category: 'Pavement Area', name: 'Lubang / Potholes (Taxiway)' },
    { zone: 'TAXIWAY', category: 'Pavement Area', name: 'FOD (Taxiway)' },
    { zone: 'TAXIWAY', category: 'Marking', name: 'Taxiway Centerline Marking' },
    { zone: 'TAXIWAY', category: 'Marking', name: 'Taxi Holding Position Marking' },
    { zone: 'TAXIWAY', category: 'Marking', name: 'Taxiway Edge Marking' },
    { zone: 'TAXIWAY', category: 'Lighting / AFL', name: 'Taxiway Edge Light' },
    { zone: 'TAXIWAY', category: 'Lighting / AFL', name: 'Taxiway Centerline Light' },
    { zone: 'TAXIWAY', category: 'Lighting / AFL', name: 'Stop Bar Light' },
    { zone: 'TAXIWAY', category: 'Strip & Drainage', name: 'Taxiway Strip (Erosion/Vegetation)' },
    { zone: 'TAXIWAY', category: 'Strip & Drainage', name: 'Saluran Drainase / Drainage' },

    // APRON
    { zone: 'APRON', category: 'Pavement Area', name: 'Ceceran Minyak / Oil Spillage' },
    { zone: 'APRON', category: 'Pavement Area', name: 'Retak / Cracking (Apron)' },
    { zone: 'APRON', category: 'Pavement Area', name: 'Lubang / Potholes (Apron)' },
    { zone: 'APRON', category: 'Pavement Area', name: 'FOD (Apron)' },
    { zone: 'APRON', category: 'Marking', name: 'Aircraft Stand Marking' },
    { zone: 'APRON', category: 'Marking', name: 'Safety Line / Red Line Apron' },
    { zone: 'APRON', category: 'Marking', name: 'Lead-in / Lead-out Line' },
    { zone: 'APRON', category: 'Lighting / AFL', name: 'Apron Floodlight (High Mast Light)' },
    { zone: 'APRON', category: 'Area Cleanliness', name: 'Tempat Sampah / FOD Bin' },
    { zone: 'APRON', category: 'Area Cleanliness', name: 'Peralatan Ground Handling (GSE) Parking Area' },
    { zone: 'APRON', category: 'Strip & Drainage', name: 'Saluran Drainase / Drainage' },
  ];

  let order = 1;
  for (const item of checklistItems) {
    const createdItem = await prisma.inspectionItem.create({
      data: {
        zone: item.zone,
        category: item.category,
        name: item.name,
        order: order++,
      },
    });
    console.log(`Created Item: [${createdItem.zone}] ${createdItem.category} - ${createdItem.name}`);
  }

  console.log('Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
