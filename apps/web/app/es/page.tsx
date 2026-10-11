import { Notice, ButtonLink } from '@cornerstone/ui';
export const metadata = { title: 'Introducción en español' };
export default function Page() {
  return (
    <main id="main" className="container page-content" lang="es">
      <div className="page-intro">
        <p className="eyebrow">Una propuesta de política pública</p>
        <h1>
          Una base justa.
          <br />
          Un futuro que usted ayuda a construir.
        </h1>
        <p className="intro-copy">
          Cornerstone propone una solución voluntaria para personas cuyo medio de vida establecido
          sufrió un daño material y directo cuando el gobierno buscó deliberadamente destruir o
          reducir de forma sustancial una industria legal.
        </p>
      </div>
      <Notice title="Traducción informativa en revisión">
        Esta introducción no sustituye el texto legislativo. El programa no existe todavía y no se
        aceptan solicitudes oficiales.
      </Notice>
      <div className="cards-grid">
        <article className="info-card">
          <h2>Participar es su decisión.</h2>
          <p>
            Nadie tendría que mudarse, capacitarse de nuevo, trabajar en la empresa ni asumir una
            deuda personal. Los miembros fundadores tendrían un voto y derechos básicos iguales de
            propiedad y distribución.
          </p>
        </article>
        <article className="info-card">
          <h2>Los hechos importan.</h2>
          <p>
            Los cambios normales del mercado y los efectos regionales indirectos no bastan. Un
            empleo posterior o un trabajo de medio tiempo no elimina por sí solo una pérdida directa
            demostrada. Los eventos históricos requieren pruebas fiables.
          </p>
        </article>
      </div>
      <ButtonLink href="/how-it-works">Ver el proceso en inglés</ButtonLink>
    </main>
  );
}
