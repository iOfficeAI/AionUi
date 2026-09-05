// The professor is the only pet character — a pure HTML/CSS figure living
// directly in pet.html. The renderer only toggles its transient states.

const professorEl: HTMLElement | null = document.getElementById('professor');

// Talking animation: toggle a 'talking' class on the professor root so the
// mouth keyframe (#professor.talking .prof-mouth) runs while the speech
// bubble is up.
window.petAPI.onTalking((talking: boolean) => {
  professorEl?.classList.toggle('talking', talking);
});

// Butt-slap reaction: jolt the professor forward for ~0.65s. Remove + re-add
// the class (with a reflow in between) so rapid re-slaps restart the animation.
const SLAP_ANIM_MS = 650;
let slapResetTimer: ReturnType<typeof setTimeout> | null = null;

window.petAPI.onSlap(() => {
  if (!professorEl) return;
  professorEl.classList.remove('slap');
  void professorEl.getBoundingClientRect(); // force reflow to restart the keyframe
  professorEl.classList.add('slap');
  if (slapResetTimer) clearTimeout(slapResetTimer);
  slapResetTimer = setTimeout(() => {
    slapResetTimer = null;
    professorEl.classList.remove('slap');
  }, SLAP_ANIM_MS);
});
