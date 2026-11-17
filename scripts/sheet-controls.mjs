/** A shared compact row outside PF2e's portrait/ABCD grid. */
export function variantControls(root) {
  let controls=root.querySelector('.gestalt-variant-controls');
  if(controls)return controls;
  const details=root.querySelector('.abcd')?.closest('.subsection.details');
  if(!details)return null;
  controls=document.createElement('div');controls.className='gestalt-variant-controls';
  controls.setAttribute('aria-label','Variant rule controls');details.after(controls);return controls;
}
