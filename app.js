// STEP 3C PATCH – Abreisetag wird mitgezählt

function isDogPresentOnDay(stay, date){
  const d = new Date(date).setHours(0,0,0,0);
  const start = new Date(stay.start).setHours(0,0,0,0);
  const end = new Date(stay.end).setHours(0,0,0,0);
  return d >= start && d <= end; // inkl. Abreisetag
}
