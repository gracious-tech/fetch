<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output indent="yes" />
    <xsl:strip-space elements="*" />

    <xsl:template match="usx">
        <xsl:apply-templates />
    </xsl:template>

    <xsl:template match="para[@style='rem']|para[@style='ide']|verse[@eid]"></xsl:template>

    <xsl:template match="para">
        <p><xsl:apply-templates select="@*|node()" /></p>
    </xsl:template>

    <xsl:template match="char">
        <em><xsl:apply-templates select="@*|node()" /></em>
    </xsl:template>

    <xsl:template match="note">
        <span class="note"><xsl:apply-templates select="@*|node()" /></span>
    </xsl:template>

    <xsl:template match="chapter">
        <h2 class="c">
            <xsl:attribute name="data-ch"><xsl:value-of select="@number" /></xsl:attribute>
            <xsl:value-of select="@number" />
        </h2>
    </xsl:template>

    <xsl:template match="verse[@sid]">
        <sup class="verse">
            <xsl:attribute name="data-v"><xsl:value-of select="@number" /></xsl:attribute>
            <xsl:value-of select="@number" />
        </sup>
    </xsl:template>

    <xsl:template match="book">
        <div>
            <xsl:attribute name="id">
                <xsl:value-of select="@code" />
            </xsl:attribute>
        </div>
    </xsl:template>

    <xsl:template match="@*|node()">
        <xsl:copy><xsl:apply-templates select="@*|node()" /></xsl:copy>
    </xsl:template>
</xsl:stylesheet>
