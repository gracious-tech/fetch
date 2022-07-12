<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<!-- Tags to ignore

WARN Some tags allow an uspecified number range (usually assumed to not go larger than 4)

-->


<!-- Elements excluded entirely -->
<xsl:template match="comment()" /><!-- XML comments... -->
<xsl:template match="book" /><!-- Book marker meaningless since books served separately -->
<xsl:template match="table|row|cell" /><!-- Tables are certain to be non-biblical content -->
<xsl:template match="sidebar" /><!-- Non-biblical info not tied to specific verse -->
<xsl:template match="periph" /><!-- Non-biblical extra info -->
<xsl:template match="figure" /><!-- Illustrations etc -->
<xsl:template match="optbreak" /><!-- Line breaks that are optional (and opting not to use) -->
<xsl:template match="ms" /><!-- TODO Multi-purpose markers (could be useful in future) -->


<!-- <para> Identification [exclude all] - Running headings & table of contents -->
<xsl:template match="para[@style='h']|para[@style='h1']|para[@style='h2']|para[@style='h3']|para[@style='h4']" />
<xsl:template match="para[@style='toc1']|para[@style='toc2']|para[@style='toc3']" />
<xsl:template match="para[@style='toca1']|para[@style='toca2']|para[@style='toca3']" />


<!-- <para> Introductions [exclude all] - Introductionary (non-biblical) content

Which might be helpful in a printed book, but intro material in apps is usually bad UX,
    and users that really care can research a translations methodology themselves
-->
<xsl:template match="para[@style='imt']|para[@style='imt1']|para[@style='imt2']|para[@style='imt3']|para[@style='imt4']" />
<xsl:template match="para[@style='is']|para[@style='is1']|para[@style='is2']|para[@style='is3']|para[@style='is4']" />
<xsl:template match="para[@style='ip']" />
<xsl:template match="para[@style='ipi']" />
<xsl:template match="para[@style='im']" />
<xsl:template match="para[@style='imi']" />
<xsl:template match="para[@style='ipq']" />
<xsl:template match="para[@style='imq']" />
<xsl:template match="para[@style='ipr']" />
<xsl:template match="para[@style='iq']|para[@style='iq1']|para[@style='iq2']|para[@style='iq3']|para[@style='iq4']" />
<xsl:template match="para[@style='ib']" />
<xsl:template match="para[@style='ili']|para[@style='ili1']|para[@style='ili2']|para[@style='ili3']|para[@style='ili4']" />
<xsl:template match="para[@style='iot']" />
<xsl:template match="para[@style='io']|para[@style='io1']|para[@style='io2']|para[@style='io3']|para[@style='io4']" />
<xsl:template match="para[@style='iex']" />
<xsl:template match="para[@style='imte']" />
<xsl:template match="para[@style='ie']" />


<!-- <para> Headings [exclude some] - Exclude book & chapter headings but keep section headings
    Not excluded: ms# | mr | s# | sr | r | d | sp | sd#
-->
<xsl:template match="para[@style='mt']|para[@style='mt1']|para[@style='mt2']|para[@style='mt3']|para[@style='mt4']" />
<xsl:template match="para[@style='mte']|para[@style='mte1']|para[@style='mte2']|para[@style='mte3']|para[@style='mte4']" />
<xsl:template match="para[@style='cl']" />
<xsl:template match="para[@style='cd']" /><!-- Non-biblical chapter summary, more than heading -->


<!-- <char> excludes -->
<xsl:template match="char[@style='rq']" /><!-- In-text cross-reference (use own system instead) -->


</xsl:stylesheet>
